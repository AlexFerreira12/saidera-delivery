-- ============ 1. Colunas aditivas em orders ============
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_pin_hash text,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_confirmed_by text,
  ADD COLUMN IF NOT EXISTS delivery_override_reason text,
  ADD COLUMN IF NOT EXISTS pin_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_delivery_confirmed_by_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_confirmed_by_check
  CHECK (delivery_confirmed_by IS NULL OR delivery_confirmed_by IN ('pin','admin'));

CREATE INDEX IF NOT EXISTS orders_queue_idx ON public.orders (status, created_at) WHERE driver_id IS NULL;
CREATE INDEX IF NOT EXISTS orders_driver_idx ON public.orders (driver_id, created_at DESC);

UPDATE public.orders
   SET delivered_at = COALESCE(delivered_at, updated_at),
       delivery_confirmed_by = COALESCE(delivery_confirmed_by, 'admin')
 WHERE status = 'entregue';

-- ============ 2. PIN do cliente (tabela separada, driver nunca lê) ============
CREATE TABLE IF NOT EXISTS public.order_delivery_pins (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  pin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_delivery_pins TO authenticated;
GRANT ALL ON public.order_delivery_pins TO service_role;
ALTER TABLE public.order_delivery_pins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_pins_select ON public.order_delivery_pins;
CREATE POLICY order_pins_select ON public.order_delivery_pins FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.is_admin())));

-- ============ 3. Auditoria de atribuição ============
CREATE TABLE IF NOT EXISTS public.order_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.delivery_drivers(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('accept','reassign','unassign','force_deliver','deliver_pin')),
  actor_user_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_assignment_events_order_idx ON public.order_assignment_events (order_id, created_at DESC);
GRANT SELECT ON public.order_assignment_events TO authenticated;
GRANT ALL ON public.order_assignment_events TO service_role;
ALTER TABLE public.order_assignment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assignment_events_select ON public.order_assignment_events;
CREATE POLICY assignment_events_select ON public.order_assignment_events FOR SELECT TO authenticated
USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.delivery_drivers d WHERE d.id = driver_id AND d.user_id = auth.uid()));

-- ============ 4. RLS: driver só enxerga o que é dele ============
CREATE OR REPLACE FUNCTION public.can_view_order(_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = _order_id
      AND (o.user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.is_order_driver(o.id))
  )
$$;

DROP POLICY IF EXISTS orders_select ON public.orders;
CREATE POLICY orders_select ON public.orders FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin() OR public.is_order_driver(id));

DROP POLICY IF EXISTS deliveries_write ON public.deliveries;
CREATE POLICY deliveries_write ON public.deliveries FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============ 5. Helper de PIN ============
CREATE OR REPLACE FUNCTION public.hash_delivery_pin(_order_id uuid, _pin text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT encode(extensions.digest(_order_id::text || ':' || btrim(_pin), 'sha256'), 'hex')
$$;
REVOKE ALL ON FUNCTION public.hash_delivery_pin(uuid, text) FROM PUBLIC, anon, authenticated;

-- ============ 6. create_order: gera PIN ============
CREATE OR REPLACE FUNCTION public.create_order(p_address_id uuid, p_payment_method text, p_items jsonb, p_notes text DEFAULT NULL::text, p_change_for text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_addr public.addresses%ROWTYPE;
  v_store public.store_settings%ROWTYPE;
  v_zone public.delivery_zones%ROWTYPE;
  v_coupon public.coupons%ROWTYPE;
  v_item jsonb;
  v_pid uuid;
  v_qty int;
  v_prod public.products%ROWTYPE;
  v_unit numeric(10,2);
  v_tier numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_fee numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_free_shipping boolean := false;
  v_order public.orders%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_uses int;
  v_prev_orders int;
  v_notes text;
  v_item_id uuid;
  v_pin text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NAO_AUTENTICADO'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'CARRINHO_VAZIO';
  END IF;

  SELECT * INTO v_store FROM public.store_settings WHERE id = 1;
  IF v_store.id IS NULL OR v_store.is_open = false THEN RAISE EXCEPTION 'LOJA_FECHADA'; END IF;

  IF p_payment_method NOT IN ('dinheiro','cartao_entrega') THEN
    IF p_payment_method = 'pix' THEN RAISE EXCEPTION 'PIX_INDISPONIVEL'; END IF;
    RAISE EXCEPTION 'PAGAMENTO_INVALIDO';
  END IF;

  SELECT * INTO v_addr FROM public.addresses WHERE id = p_address_id;
  IF v_addr.id IS NULL OR v_addr.user_id <> v_user THEN RAISE EXCEPTION 'ENDERECO_INVALIDO'; END IF;

  SELECT * INTO v_zone FROM public.delivery_zones
   WHERE is_active = true AND lower(neighborhood) = lower(v_addr.neighborhood) LIMIT 1;
  IF v_zone.id IS NULL THEN RAISE EXCEPTION 'FORA_DA_AREA'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'QUANTIDADE_INVALIDA'; END IF;

    SELECT * INTO v_prod FROM public.products WHERE id = v_pid FOR UPDATE;
    IF v_prod.id IS NULL OR v_prod.is_active = false THEN
      RAISE EXCEPTION 'PRODUTO_INDISPONIVEL:%', COALESCE(v_prod.name, 'item');
    END IF;
    IF v_prod.stock < v_qty THEN RAISE EXCEPTION 'ESTOQUE_INSUFICIENTE:%', v_prod.name; END IF;

    v_unit := COALESCE(v_prod.promo_price, v_prod.price);
    SELECT pr.unit_price INTO v_tier FROM public.promotions pr
     WHERE pr.product_id = v_prod.id AND pr.is_active = true AND pr.unit_price IS NOT NULL
       AND pr.min_quantity <= v_qty
       AND (pr.starts_at IS NULL OR pr.starts_at <= now())
       AND (pr.ends_at IS NULL OR pr.ends_at >= now())
     ORDER BY pr.min_quantity DESC LIMIT 1;
    IF v_tier IS NOT NULL AND v_tier < v_unit THEN v_unit := v_tier; END IF;
    v_tier := NULL;
    v_subtotal := v_subtotal + (v_unit * v_qty);
  END LOOP;

  IF v_subtotal < v_zone.min_order THEN RAISE EXCEPTION 'PEDIDO_MINIMO:%', v_zone.min_order; END IF;

  v_fee := v_zone.fee;
  IF v_store.free_delivery_above > 0 AND v_subtotal >= v_store.free_delivery_above THEN v_fee := 0; END IF;

  IF p_coupon_code IS NOT NULL AND btrim(p_coupon_code) <> '' THEN
    SELECT * INTO v_coupon FROM public.coupons WHERE code = upper(btrim(p_coupon_code)) FOR UPDATE;
    IF v_coupon.id IS NULL OR v_coupon.is_active = false THEN RAISE EXCEPTION 'CUPOM_INVALIDO'; END IF;
    IF v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > now() THEN RAISE EXCEPTION 'CUPOM_NAO_VIGENTE'; END IF;
    IF v_coupon.ends_at IS NOT NULL AND v_coupon.ends_at < now() THEN RAISE EXCEPTION 'CUPOM_EXPIRADO'; END IF;
    IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN RAISE EXCEPTION 'CUPOM_ESGOTADO'; END IF;
    SELECT count(*) INTO v_uses FROM public.coupon_usages WHERE coupon_id = v_coupon.id AND user_id = v_user;
    IF v_uses >= v_coupon.max_uses_per_user THEN RAISE EXCEPTION 'CUPOM_JA_USADO'; END IF;
    IF v_coupon.first_order_only THEN
      SELECT count(*) INTO v_prev_orders FROM public.orders WHERE user_id = v_user AND status <> 'cancelado';
      IF v_prev_orders > 0 THEN RAISE EXCEPTION 'CUPOM_PRIMEIRA_COMPRA'; END IF;
    END IF;
    IF v_subtotal < v_coupon.min_order THEN RAISE EXCEPTION 'CUPOM_MINIMO:%', v_coupon.min_order; END IF;

    IF v_coupon.discount_type = 'free_shipping' THEN
      v_discount := v_fee; v_free_shipping := true;
    ELSIF v_coupon.discount_type = 'percent' THEN
      v_discount := round(v_subtotal * v_coupon.discount_value / 100, 2);
    ELSE
      v_discount := least(v_coupon.discount_value, v_subtotal);
    END IF;
  END IF;

  v_total := greatest(v_subtotal + v_fee - v_discount, 0);
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user;

  v_notes := nullif(btrim(concat_ws(' · ',
    nullif(btrim(COALESCE(p_notes, '')), ''),
    CASE WHEN p_payment_method = 'dinheiro' AND nullif(btrim(COALESCE(p_change_for,'')),'') IS NOT NULL
         THEN 'Troco para ' || btrim(p_change_for) END)), '');

  INSERT INTO public.orders (
    user_id, address_id, status, payment_method, payment_status,
    subtotal, delivery_fee, discount, total, coupon_code, notes,
    address_snapshot, customer_name, customer_phone, eta_minutes
  ) VALUES (
    v_user, v_addr.id, 'novo', p_payment_method, 'pendente',
    v_subtotal, v_fee, v_discount, v_total,
    CASE WHEN v_coupon.id IS NOT NULL THEN v_coupon.code END,
    v_notes, to_jsonb(v_addr), v_profile.full_name, v_profile.phone, v_zone.eta_minutes
  ) RETURNING * INTO v_order;

  v_pin := lpad((floor(random() * 10000))::int::text, 4, '0');
  INSERT INTO public.order_delivery_pins (order_id, pin) VALUES (v_order.id, v_pin);
  UPDATE public.orders SET delivery_pin_hash = public.hash_delivery_pin(v_order.id, v_pin) WHERE id = v_order.id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    SELECT * INTO v_prod FROM public.products WHERE id = v_pid;
    v_unit := COALESCE(v_prod.promo_price, v_prod.price);
    SELECT pr.unit_price INTO v_tier FROM public.promotions pr
     WHERE pr.product_id = v_prod.id AND pr.is_active = true AND pr.unit_price IS NOT NULL
       AND pr.min_quantity <= v_qty
       AND (pr.starts_at IS NULL OR pr.starts_at <= now())
       AND (pr.ends_at IS NULL OR pr.ends_at >= now())
     ORDER BY pr.min_quantity DESC LIMIT 1;
    IF v_tier IS NOT NULL AND v_tier < v_unit THEN v_unit := v_tier; END IF;
    v_tier := NULL;

    INSERT INTO public.order_items (order_id, product_id, product_name, image_url, quantity, unit_price, total_price)
    VALUES (v_order.id, v_prod.id, v_prod.name, v_prod.image_url, v_qty, v_unit, v_unit * v_qty)
    RETURNING id INTO v_item_id;

    PERFORM public.apply_stock_change(
      v_prod.id, 'venda', -v_qty, 'Pedido #' || v_order.order_number, v_order.id, v_user, 'trigger',
      'venda:' || v_item_id::text
    );
  END LOOP;

  IF v_coupon.id IS NOT NULL THEN
    INSERT INTO public.coupon_usages (coupon_id, user_id, order_id) VALUES (v_coupon.id, v_user, v_order.id);
    UPDATE public.coupons SET used_count = used_count + 1 WHERE id = v_coupon.id;
  END IF;

  INSERT INTO public.payments (order_id, provider, method, status, amount)
  VALUES (v_order.id, 'na_entrega', p_payment_method, 'pendente', v_total);

  RETURN jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number,
    'subtotal', v_subtotal, 'delivery_fee', v_fee, 'discount', v_discount,
    'total', v_total, 'free_shipping', v_free_shipping
  );
END; $function$;

-- ============ 7. set_order_status: driver perde 'entregue' ============
CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_driver public.delivery_drivers%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NAO_AUTENTICADO'; END IF;
  v_is_admin := public.has_role(v_user, 'admin');
  IF NOT (v_is_admin OR public.has_role(v_user, 'driver')) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF p_status NOT IN ('novo','confirmado','em_preparo','pronto','saiu_para_entrega','entregue','cancelado') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;

  IF NOT v_is_admin THEN
    SELECT * INTO v_driver FROM public.delivery_drivers WHERE user_id = v_user AND is_active = true;
    IF v_driver.id IS NULL THEN RAISE EXCEPTION 'ENTREGADOR_NAO_CADASTRADO'; END IF;
    IF v_order.driver_id IS NULL OR v_order.driver_id <> v_driver.id THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
    IF NOT (v_order.status = 'pronto' AND p_status = 'saiu_para_entrega') THEN
      RAISE EXCEPTION 'SEM_PERMISSAO';
    END IF;
  END IF;

  IF v_order.status = p_status THEN
    RETURN jsonb_build_object('order_id', v_order.id, 'status', v_order.status);
  END IF;
  IF v_order.status IN ('entregue','cancelado') THEN RAISE EXCEPTION 'PEDIDO_FINALIZADO'; END IF;

  UPDATE public.orders SET
    status = p_status,
    dispatched_at = CASE WHEN p_status = 'saiu_para_entrega' THEN COALESCE(dispatched_at, now()) ELSE dispatched_at END,
    delivered_at = CASE WHEN p_status = 'entregue' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
    delivery_confirmed_by = CASE WHEN p_status = 'entregue' THEN COALESCE(delivery_confirmed_by, 'admin') ELSE delivery_confirmed_by END
  WHERE id = v_order.id;

  RETURN jsonb_build_object('order_id', v_order.id, 'status', p_status);
END; $function$;

-- ============ 8. accept_delivery endurecido ============
CREATE OR REPLACE FUNCTION public.accept_delivery(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_driver public.delivery_drivers%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NAO_AUTENTICADO'; END IF;
  SELECT * INTO v_driver FROM public.delivery_drivers WHERE user_id = v_user AND is_active = true;
  IF v_driver.id IS NULL THEN RAISE EXCEPTION 'ENTREGADOR_NAO_CADASTRADO'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;

  IF v_order.driver_id = v_driver.id THEN
    RETURN jsonb_build_object('order_id', v_order.id, 'driver_id', v_driver.id, 'status', v_order.status, 'already', true);
  END IF;
  IF v_order.driver_id IS NOT NULL THEN RAISE EXCEPTION 'ENTREGA_JA_ACEITA'; END IF;
  IF v_order.status <> 'pronto' THEN RAISE EXCEPTION 'PEDIDO_NAO_DISPONIVEL'; END IF;

  UPDATE public.orders
     SET driver_id = v_driver.id, status = 'saiu_para_entrega',
         accepted_at = now(), dispatched_at = COALESCE(dispatched_at, now())
   WHERE id = v_order.id;

  INSERT INTO public.order_assignment_events (order_id, driver_id, action, actor_user_id)
  VALUES (v_order.id, v_driver.id, 'accept', v_user);

  RETURN jsonb_build_object('order_id', v_order.id, 'driver_id', v_driver.id, 'status', 'saiu_para_entrega', 'already', false);
END; $function$;

-- ============ 9. Fila mínima para o entregador ============
CREATE OR REPLACE FUNCTION public.driver_available_orders()
RETURNS TABLE(id uuid, order_number integer, neighborhood text, street text, items_count bigint, total numeric, payment_method text, eta_minutes integer, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(),'driver') OR public.is_admin()) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  RETURN QUERY
  SELECT o.id, o.order_number,
         COALESCE(o.address_snapshot->>'neighborhood','') AS neighborhood,
         COALESCE(o.address_snapshot->>'street','') AS street,
         (SELECT count(*) FROM public.order_items oi WHERE oi.order_id = o.id) AS items_count,
         o.total, o.payment_method, o.eta_minutes, o.created_at
    FROM public.orders o
   WHERE o.driver_id IS NULL AND o.status = 'pronto'
   ORDER BY o.created_at
   LIMIT 100;
END; $function$;

-- ============ 10. Pedidos atribuídos ao entregador ============
CREATE OR REPLACE FUNCTION public.driver_my_orders()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_driver public.delivery_drivers%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_driver FROM public.delivery_drivers WHERE user_id = auth.uid() AND is_active = true;
  IF v_driver.id IS NULL THEN RAISE EXCEPTION 'ENTREGADOR_NAO_CADASTRADO'; END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'accepted_at'), '[]'::jsonb) INTO v_result FROM (
    SELECT jsonb_build_object(
      'id', o.id, 'order_number', o.order_number, 'status', o.status,
      'total', o.total, 'payment_method', o.payment_method, 'notes', o.notes,
      'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
      'eta_minutes', o.eta_minutes, 'accepted_at', o.accepted_at, 'created_at', o.created_at,
      'pin_attempts', o.pin_attempts,
      'address', jsonb_build_object(
        'street', o.address_snapshot->>'street',
        'number', o.address_snapshot->>'number',
        'complement', o.address_snapshot->>'complement',
        'neighborhood', o.address_snapshot->>'neighborhood',
        'city', o.address_snapshot->>'city',
        'reference', o.address_snapshot->>'reference'
      ),
      'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', oi.id, 'name', oi.product_name, 'quantity', oi.quantity) ORDER BY oi.product_name), '[]'::jsonb)
                  FROM public.order_items oi WHERE oi.order_id = o.id)
    ) AS x
      FROM public.orders o
     WHERE o.driver_id = v_driver.id AND o.status = 'saiu_para_entrega'
  ) s;

  RETURN v_result;
END; $function$;

-- ============ 11. Histórico do entregador ============
CREATE OR REPLACE FUNCTION public.driver_history(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_driver public.delivery_drivers%ROWTYPE;
  v_rows jsonb;
  v_today bigint; v_week bigint; v_all bigint;
BEGIN
  SELECT * INTO v_driver FROM public.delivery_drivers WHERE user_id = auth.uid();
  IF v_driver.id IS NULL THEN RAISE EXCEPTION 'ENTREGADOR_NAO_CADASTRADO'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'order_number', o.order_number, 'total', o.total,
           'neighborhood', o.address_snapshot->>'neighborhood',
           'delivered_at', o.delivered_at,
           'confirmed_by', o.delivery_confirmed_by
         ) ORDER BY o.delivered_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT * FROM public.orders
       WHERE driver_id = v_driver.id AND status = 'entregue'
       ORDER BY delivered_at DESC
       LIMIT LEAST(COALESCE(p_limit,20), 100) OFFSET GREATEST(COALESCE(p_offset,0),0)
    ) o;

  SELECT count(*) FILTER (WHERE delivered_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'),
         count(*) FILTER (WHERE delivered_at >= now() - interval '7 days'),
         count(*)
    INTO v_today, v_week, v_all
    FROM public.orders WHERE driver_id = v_driver.id AND status = 'entregue';

  RETURN jsonb_build_object('rows', v_rows, 'today', v_today, 'week', v_week, 'total', v_all);
END; $function$;

-- ============ 12. Conclusão com PIN ============
CREATE OR REPLACE FUNCTION public.driver_complete_delivery(p_order_id uuid, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_driver public.delivery_drivers%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NAO_AUTENTICADO'; END IF;
  SELECT * INTO v_driver FROM public.delivery_drivers WHERE user_id = v_user AND is_active = true;
  IF v_driver.id IS NULL THEN RAISE EXCEPTION 'ENTREGADOR_NAO_CADASTRADO'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;
  IF v_order.driver_id IS NULL OR v_order.driver_id <> v_driver.id THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;

  IF v_order.status = 'entregue' THEN
    RETURN jsonb_build_object('order_id', v_order.id, 'status', 'entregue', 'already', true);
  END IF;
  IF v_order.status <> 'saiu_para_entrega' THEN RAISE EXCEPTION 'PEDIDO_NAO_DISPONIVEL'; END IF;
  IF v_order.pin_attempts >= 5 THEN RAISE EXCEPTION 'PIN_BLOQUEADO'; END IF;

  IF v_order.delivery_pin_hash IS NULL
     OR v_order.delivery_pin_hash <> public.hash_delivery_pin(v_order.id, COALESCE(p_pin,'')) THEN
    UPDATE public.orders SET pin_attempts = pin_attempts + 1 WHERE id = v_order.id;
    IF v_order.pin_attempts + 1 >= 5 THEN RAISE EXCEPTION 'PIN_BLOQUEADO'; END IF;
    RAISE EXCEPTION 'PIN_INVALIDO';
  END IF;

  UPDATE public.orders
     SET status = 'entregue', delivered_at = now(), delivery_confirmed_by = 'pin', pin_attempts = 0
   WHERE id = v_order.id;

  INSERT INTO public.order_assignment_events (order_id, driver_id, action, actor_user_id)
  VALUES (v_order.id, v_driver.id, 'deliver_pin', v_user);

  RETURN jsonb_build_object('order_id', v_order.id, 'status', 'entregue', 'already', false);
END; $function$;

-- ============ 13. Intervenções do admin ============
CREATE OR REPLACE FUNCTION public.admin_assign_driver(p_order_id uuid, p_driver_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_order public.orders%ROWTYPE; v_driver public.delivery_drivers%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  SELECT * INTO v_driver FROM public.delivery_drivers WHERE id = p_driver_id AND is_active = true;
  IF v_driver.id IS NULL THEN RAISE EXCEPTION 'ENTREGADOR_NAO_ENCONTRADO'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;
  IF v_order.status IN ('entregue','cancelado') THEN RAISE EXCEPTION 'PEDIDO_FINALIZADO'; END IF;

  UPDATE public.orders
     SET driver_id = v_driver.id,
         status = CASE WHEN status = 'pronto' THEN 'saiu_para_entrega' ELSE status END,
         accepted_at = COALESCE(accepted_at, now()),
         dispatched_at = COALESCE(dispatched_at, now())
   WHERE id = v_order.id;

  INSERT INTO public.order_assignment_events (order_id, driver_id, action, actor_user_id)
  VALUES (v_order.id, v_driver.id, 'reassign', auth.uid());

  RETURN jsonb_build_object('order_id', v_order.id, 'driver_id', v_driver.id);
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_unassign_driver(p_order_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF nullif(btrim(COALESCE(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;
  IF v_order.status IN ('entregue','cancelado') THEN RAISE EXCEPTION 'PEDIDO_FINALIZADO'; END IF;
  IF v_order.driver_id IS NULL THEN RAISE EXCEPTION 'PEDIDO_SEM_ENTREGADOR'; END IF;

  INSERT INTO public.order_assignment_events (order_id, driver_id, action, actor_user_id, reason)
  VALUES (v_order.id, v_order.driver_id, 'unassign', auth.uid(), btrim(p_reason));

  UPDATE public.orders
     SET driver_id = NULL, status = 'pronto', accepted_at = NULL, dispatched_at = NULL, pin_attempts = 0
   WHERE id = v_order.id;

  RETURN jsonb_build_object('order_id', v_order.id, 'status', 'pronto');
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_force_deliver(p_order_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF nullif(btrim(COALESCE(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;
  IF v_order.status = 'entregue' THEN
    RETURN jsonb_build_object('order_id', v_order.id, 'status', 'entregue', 'already', true);
  END IF;
  IF v_order.status = 'cancelado' THEN RAISE EXCEPTION 'PEDIDO_FINALIZADO'; END IF;

  UPDATE public.orders
     SET status = 'entregue', delivered_at = now(),
         delivery_confirmed_by = 'admin', delivery_override_reason = btrim(p_reason), pin_attempts = 0
   WHERE id = v_order.id;

  INSERT INTO public.order_assignment_events (order_id, driver_id, action, actor_user_id, reason)
  VALUES (v_order.id, v_order.driver_id, 'force_deliver', auth.uid(), btrim(p_reason));

  RETURN jsonb_build_object('order_id', v_order.id, 'status', 'entregue', 'already', false);
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_reset_pin_attempts(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  UPDATE public.orders SET pin_attempts = 0 WHERE id = p_order_id;
  RETURN jsonb_build_object('order_id', p_order_id, 'pin_attempts', 0);
END; $function$;

-- ============ 14. Grants ============
REVOKE ALL ON FUNCTION public.driver_available_orders() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_my_orders() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_history(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_complete_delivery(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_assign_driver(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_unassign_driver(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_force_deliver(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reset_pin_attempts(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.driver_available_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_my_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_history(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_complete_delivery(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_driver(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unassign_driver(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_deliver(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_pin_attempts(uuid) TO authenticated;