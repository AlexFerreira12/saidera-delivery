-- 1. Idempotent stock restore flag
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_restored_at timestamptz;

-- 2. Replace stock movement trigger with idempotent BEFORE UPDATE version
DROP TRIGGER IF EXISTS orders_stock_movement ON public.orders;

CREATE OR REPLACE FUNCTION public.apply_stock_movement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM 'cancelado' AND OLD.stock_restored_at IS NULL THEN
    UPDATE public.products p SET stock = p.stock + oi.quantity
    FROM public.order_items oi WHERE oi.order_id = NEW.id AND oi.product_id = p.id;
    NEW.stock_restored_at := now();
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER orders_stock_movement BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- 3. Authoritative order creation
CREATE OR REPLACE FUNCTION public.create_order(
  p_address_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_change_for text DEFAULT NULL,
  p_coupon_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'CARRINHO_VAZIO';
  END IF;

  SELECT * INTO v_store FROM public.store_settings WHERE id = 1;
  IF v_store.id IS NULL OR v_store.is_open = false THEN
    RAISE EXCEPTION 'LOJA_FECHADA';
  END IF;

  IF p_payment_method NOT IN ('dinheiro','cartao_entrega') THEN
    IF p_payment_method = 'pix' THEN
      RAISE EXCEPTION 'PIX_INDISPONIVEL';
    END IF;
    RAISE EXCEPTION 'PAGAMENTO_INVALIDO';
  END IF;

  SELECT * INTO v_addr FROM public.addresses WHERE id = p_address_id;
  IF v_addr.id IS NULL OR v_addr.user_id <> v_user THEN
    RAISE EXCEPTION 'ENDERECO_INVALIDO';
  END IF;

  SELECT * INTO v_zone FROM public.delivery_zones
   WHERE is_active = true AND lower(neighborhood) = lower(v_addr.neighborhood)
   LIMIT 1;
  IF v_zone.id IS NULL THEN
    RAISE EXCEPTION 'FORA_DA_AREA';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::int, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'QUANTIDADE_INVALIDA';
    END IF;

    SELECT * INTO v_prod FROM public.products WHERE id = v_pid FOR UPDATE;
    IF v_prod.id IS NULL OR v_prod.is_active = false THEN
      RAISE EXCEPTION 'PRODUTO_INDISPONIVEL:%', COALESCE(v_prod.name, 'item');
    END IF;
    IF v_prod.stock < v_qty THEN
      RAISE EXCEPTION 'ESTOQUE_INSUFICIENTE:%', v_prod.name;
    END IF;

    v_unit := COALESCE(v_prod.promo_price, v_prod.price);

    SELECT pr.unit_price INTO v_tier
      FROM public.promotions pr
     WHERE pr.product_id = v_prod.id
       AND pr.is_active = true
       AND pr.unit_price IS NOT NULL
       AND pr.min_quantity <= v_qty
       AND (pr.starts_at IS NULL OR pr.starts_at <= now())
       AND (pr.ends_at IS NULL OR pr.ends_at >= now())
     ORDER BY pr.min_quantity DESC
     LIMIT 1;

    IF v_tier IS NOT NULL AND v_tier < v_unit THEN
      v_unit := v_tier;
    END IF;
    v_tier := NULL;

    v_subtotal := v_subtotal + (v_unit * v_qty);
  END LOOP;

  IF v_subtotal < v_zone.min_order THEN
    RAISE EXCEPTION 'PEDIDO_MINIMO:%', v_zone.min_order;
  END IF;

  v_fee := v_zone.fee;
  IF v_store.free_delivery_above > 0 AND v_subtotal >= v_store.free_delivery_above THEN
    v_fee := 0;
  END IF;

  IF p_coupon_code IS NOT NULL AND btrim(p_coupon_code) <> '' THEN
    SELECT * INTO v_coupon FROM public.coupons
     WHERE code = upper(btrim(p_coupon_code)) FOR UPDATE;

    IF v_coupon.id IS NULL OR v_coupon.is_active = false THEN
      RAISE EXCEPTION 'CUPOM_INVALIDO';
    END IF;
    IF v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > now() THEN
      RAISE EXCEPTION 'CUPOM_NAO_VIGENTE';
    END IF;
    IF v_coupon.ends_at IS NOT NULL AND v_coupon.ends_at < now() THEN
      RAISE EXCEPTION 'CUPOM_EXPIRADO';
    END IF;
    IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
      RAISE EXCEPTION 'CUPOM_ESGOTADO';
    END IF;
    SELECT count(*) INTO v_uses FROM public.coupon_usages
     WHERE coupon_id = v_coupon.id AND user_id = v_user;
    IF v_uses >= v_coupon.max_uses_per_user THEN
      RAISE EXCEPTION 'CUPOM_JA_USADO';
    END IF;
    IF v_coupon.first_order_only THEN
      SELECT count(*) INTO v_prev_orders FROM public.orders
       WHERE user_id = v_user AND status <> 'cancelado';
      IF v_prev_orders > 0 THEN
        RAISE EXCEPTION 'CUPOM_PRIMEIRA_COMPRA';
      END IF;
    END IF;
    IF v_subtotal < v_coupon.min_order THEN
      RAISE EXCEPTION 'CUPOM_MINIMO:%', v_coupon.min_order;
    END IF;

    IF v_coupon.discount_type = 'free_shipping' THEN
      v_discount := v_fee;
      v_free_shipping := true;
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
    v_notes,
    to_jsonb(v_addr), v_profile.full_name, v_profile.phone, v_zone.eta_minutes
  ) RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    SELECT * INTO v_prod FROM public.products WHERE id = v_pid;
    v_unit := COALESCE(v_prod.promo_price, v_prod.price);

    SELECT pr.unit_price INTO v_tier
      FROM public.promotions pr
     WHERE pr.product_id = v_prod.id
       AND pr.is_active = true
       AND pr.unit_price IS NOT NULL
       AND pr.min_quantity <= v_qty
       AND (pr.starts_at IS NULL OR pr.starts_at <= now())
       AND (pr.ends_at IS NULL OR pr.ends_at >= now())
     ORDER BY pr.min_quantity DESC
     LIMIT 1;
    IF v_tier IS NOT NULL AND v_tier < v_unit THEN
      v_unit := v_tier;
    END IF;
    v_tier := NULL;

    INSERT INTO public.order_items (order_id, product_id, product_name, image_url, quantity, unit_price, total_price)
    VALUES (v_order.id, v_prod.id, v_prod.name, v_prod.image_url, v_qty, v_unit, v_unit * v_qty);

    UPDATE public.products SET stock = stock - v_qty WHERE id = v_prod.id;
  END LOOP;

  IF v_coupon.id IS NOT NULL THEN
    INSERT INTO public.coupon_usages (coupon_id, user_id, order_id)
    VALUES (v_coupon.id, v_user, v_order.id);
    UPDATE public.coupons SET used_count = used_count + 1 WHERE id = v_coupon.id;
  END IF;

  INSERT INTO public.payments (order_id, provider, method, status, amount)
  VALUES (v_order.id, 'na_entrega', p_payment_method, 'pendente', v_total);

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'subtotal', v_subtotal,
    'delivery_fee', v_fee,
    'discount', v_discount,
    'total', v_total,
    'free_shipping', v_free_shipping
  );
END; $$;

REVOKE ALL ON FUNCTION public.create_order(uuid, text, jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order(uuid, text, jsonb, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, jsonb, text, text, text) TO authenticated;

-- 4. Status transitions for admin / driver
CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_is_driver boolean;
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO';
  END IF;

  v_is_admin := public.has_role(v_user, 'admin');
  v_is_driver := public.has_role(v_user, 'driver');
  IF NOT (v_is_admin OR v_is_driver) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO';
  END IF;

  IF p_status NOT IN ('novo','confirmado','em_preparo','pronto','saiu_para_entrega','entregue','cancelado') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO';
  END IF;

  IF NOT v_is_admin AND p_status NOT IN ('saiu_para_entrega','entregue') THEN
    RAISE EXCEPTION 'SEM_PERMISSAO';
  END IF;

  IF v_order.status = p_status THEN
    RETURN jsonb_build_object('order_id', v_order.id, 'status', v_order.status);
  END IF;

  IF v_order.status IN ('entregue','cancelado') THEN
    RAISE EXCEPTION 'PEDIDO_FINALIZADO';
  END IF;

  UPDATE public.orders SET status = p_status WHERE id = v_order.id;
  RETURN jsonb_build_object('order_id', v_order.id, 'status', p_status);
END; $$;

REVOKE ALL ON FUNCTION public.set_order_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_order_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_delivery(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_driver public.delivery_drivers%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO';
  END IF;

  SELECT * INTO v_driver FROM public.delivery_drivers WHERE user_id = v_user AND is_active = true;
  IF v_driver.id IS NULL THEN
    RAISE EXCEPTION 'ENTREGADOR_NAO_CADASTRADO';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO';
  END IF;
  IF v_order.driver_id IS NOT NULL AND v_order.driver_id <> v_driver.id THEN
    RAISE EXCEPTION 'ENTREGA_JA_ACEITA';
  END IF;
  IF v_order.status NOT IN ('pronto','saiu_para_entrega') THEN
    RAISE EXCEPTION 'PEDIDO_NAO_DISPONIVEL';
  END IF;

  UPDATE public.orders SET driver_id = v_driver.id, status = 'saiu_para_entrega' WHERE id = v_order.id;
  RETURN jsonb_build_object('order_id', v_order.id, 'driver_id', v_driver.id);
END; $$;

REVOKE ALL ON FUNCTION public.accept_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_delivery(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_delivery(uuid) TO authenticated;

-- 5. Lock down direct client writes
DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
DROP POLICY IF EXISTS "orders_update" ON public.orders;
CREATE POLICY "orders_update_staff" ON public.orders FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.has_role(auth.uid(),'driver'))
  WITH CHECK (public.is_admin() OR public.has_role(auth.uid(),'driver'));
REVOKE INSERT ON public.orders FROM authenticated;

DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
REVOKE INSERT ON public.order_items FROM authenticated;

DROP POLICY IF EXISTS "coupon_usages_insert" ON public.coupon_usages;
REVOKE INSERT ON public.coupon_usages FROM authenticated;

DROP POLICY IF EXISTS "payments_insert" ON public.payments;
CREATE POLICY "payments_insert_admin" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.is_admin());