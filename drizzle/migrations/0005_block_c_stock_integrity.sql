-- 1) Normalize opening-balance rows (before = 0, after = delta) and cover every product
UPDATE public.stock_movements
   SET stock_before = 0,
       stock_after = quantity_delta
 WHERE kind = 'saldo_inicial';

INSERT INTO public.stock_movements (product_id, kind, quantity_delta, stock_before, stock_after, reason, source, idempotency_key)
SELECT p.id, 'saldo_inicial', p.stock, 0, p.stock,
       'Saldo inicial registrado na implantação do controle de estoque',
       'migration', 'saldo_inicial:' || p.id::text
  FROM public.products p
 WHERE NOT EXISTS (
   SELECT 1 FROM public.stock_movements m
    WHERE m.product_id = p.id AND m.kind = 'saldo_inicial'
 );

-- 2) Integrity constraints
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_delta_nonzero
  CHECK (quantity_delta <> 0 OR kind = 'saldo_inicial');

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_balance_coherent
  CHECK (stock_after = stock_before + quantity_delta);

-- 3) Atomic + idempotent stock change (ledger insert gates the physical change)
CREATE OR REPLACE FUNCTION public.apply_stock_change(
  p_product_id uuid,
  p_kind text,
  p_delta integer,
  p_reason text DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_source text DEFAULT 'rpc',
  p_key text DEFAULT NULL,
  p_unit_cost numeric DEFAULT NULL,
  p_cost_before numeric DEFAULT NULL,
  p_cost_after numeric DEFAULT NULL,
  p_absolute integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
  v_before int;
  v_after int;
  v_delta int;
  v_id uuid;
BEGIN
  SELECT p.stock, p.name INTO v_before, v_name FROM public.products p WHERE p.id = p_product_id FOR UPDATE;
  IF v_before IS NULL THEN
    RAISE EXCEPTION 'PRODUTO_NAO_ENCONTRADO';
  END IF;

  IF p_absolute IS NOT NULL THEN
    v_after := p_absolute;
    v_delta := p_absolute - v_before;
  ELSE
    v_delta := p_delta;
    v_after := v_before + v_delta;
  END IF;

  IF v_after < 0 THEN
    RAISE EXCEPTION 'ESTOQUE_INSUFICIENTE:%', v_name;
  END IF;

  IF v_delta = 0 AND p_kind <> 'saldo_inicial' THEN
    RETURN jsonb_build_object('applied', false, 'changed', false, 'stock', v_before);
  END IF;

  INSERT INTO public.stock_movements (
    product_id, kind, quantity_delta, stock_before, stock_after, reason,
    order_id, actor_user_id, source, idempotency_key, unit_cost, cost_before, cost_after
  ) VALUES (
    p_product_id, p_kind, v_delta, v_before, v_after, p_reason,
    p_order_id, p_actor, p_source, p_key, p_unit_cost, p_cost_before, p_cost_after
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- already recorded: do NOT touch stock a second time
    RETURN jsonb_build_object('applied', false, 'changed', false, 'stock', v_before);
  END IF;

  UPDATE public.products SET stock = v_after WHERE id = p_product_id;

  RETURN jsonb_build_object('applied', true, 'changed', true, 'stock', v_after,
                            'stock_before', v_before, 'stock_after', v_after);
END; $$;

REVOKE ALL ON FUNCTION public.apply_stock_change(uuid,text,integer,text,uuid,uuid,text,text,numeric,numeric,numeric,integer) FROM PUBLIC, anon, authenticated;

-- 4) create_order uses the gated helper for the sale movement
CREATE OR REPLACE FUNCTION public.create_order(p_address_id uuid, p_payment_method text, p_items jsonb, p_notes text DEFAULT NULL::text, p_change_for text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    VALUES (v_order.id, v_prod.id, v_prod.name, v_prod.image_url, v_qty, v_unit, v_unit * v_qty)
    RETURNING id INTO v_item_id;

    PERFORM public.apply_stock_change(
      v_prod.id, 'venda', -v_qty,
      'Pedido #' || v_order.order_number, v_order.id, v_user, 'rpc',
      'venda:' || v_item_id::text
    );
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
END; $function$;

-- 5) Cancellation trigger keeps stock_restored_at and per-item idempotency
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  IF NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM 'cancelado' AND OLD.stock_restored_at IS NULL THEN
    FOR r IN
      SELECT oi.id, oi.product_id, oi.quantity
        FROM public.order_items oi
       WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
       ORDER BY oi.product_id
    LOOP
      PERFORM public.apply_stock_change(
        r.product_id, 'cancelamento', r.quantity,
        'Cancelamento do pedido #' || NEW.order_number, NEW.id, auth.uid(), 'trigger',
        'cancelamento:' || r.id::text
      );
    END LOOP;
    NEW.stock_restored_at := now();
  END IF;
  RETURN NEW;
END; $function$;

-- 6) Admin operations go through the same gated helper
CREATE OR REPLACE FUNCTION public.admin_stock_entry(p_product_id uuid, p_quantity integer, p_reason text DEFAULT NULL, p_unit_cost numeric DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_cost_before numeric(10,2);
  v_cost_after numeric(10,2);
  v_res jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'QUANTIDADE_INVALIDA'; END IF;

  SELECT cost INTO v_cost_before FROM public.products WHERE id = p_product_id;
  v_cost_after := v_cost_before;
  IF p_unit_cost IS NOT NULL AND p_unit_cost > 0 THEN
    v_cost_after := p_unit_cost;
  END IF;

  v_res := public.apply_stock_change(
    p_product_id, 'entrada', p_quantity,
    nullif(btrim(COALESCE(p_reason,'')),''), NULL, auth.uid(), 'rpc', NULL,
    p_unit_cost, v_cost_before, v_cost_after
  );

  IF p_unit_cost IS NOT NULL AND p_unit_cost > 0 THEN
    UPDATE public.products SET cost = p_unit_cost WHERE id = p_product_id;
  END IF;

  RETURN jsonb_build_object('product_id', p_product_id, 'stock', v_res->>'stock');
END; $$;

CREATE OR REPLACE FUNCTION public.admin_stock_adjust(p_product_id uuid, p_delta integer, p_kind text, p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('ajuste','perda') THEN RAISE EXCEPTION 'TIPO_INVALIDO'; END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN RAISE EXCEPTION 'QUANTIDADE_INVALIDA'; END IF;
  IF nullif(btrim(COALESCE(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;
  IF p_kind = 'perda' AND p_delta > 0 THEN RAISE EXCEPTION 'QUANTIDADE_INVALIDA'; END IF;

  v_res := public.apply_stock_change(
    p_product_id, p_kind, p_delta, btrim(p_reason), NULL, auth.uid(), 'rpc'
  );

  RETURN jsonb_build_object('product_id', p_product_id, 'stock', v_res->>'stock');
END; $$;

CREATE OR REPLACE FUNCTION public.admin_stock_inventory(p_product_id uuid, p_counted integer, p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF p_counted IS NULL OR p_counted < 0 THEN RAISE EXCEPTION 'QUANTIDADE_INVALIDA'; END IF;
  IF nullif(btrim(COALESCE(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;

  v_res := public.apply_stock_change(
    p_product_id, 'inventario', NULL, btrim(p_reason), NULL, auth.uid(), 'rpc', NULL,
    NULL, NULL, NULL, p_counted
  );

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'stock', v_res->>'stock',
    'changed', COALESCE((v_res->>'changed')::boolean, false)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.admin_stock_bulk_entry(p_items jsonb, p_reason text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  v_count int := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'LISTA_VAZIA';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) e
     WHERE e->>'product_id' IS NULL OR COALESCE((e->>'quantity')::int, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'QUANTIDADE_INVALIDA';
  END IF;

  FOR r IN
    SELECT (e->>'product_id')::uuid AS pid, sum((e->>'quantity')::int)::int AS qty
      FROM jsonb_array_elements(p_items) e
     GROUP BY (e->>'product_id')::uuid
     ORDER BY (e->>'product_id')::uuid
  LOOP
    PERFORM public.apply_stock_change(
      r.pid, 'entrada', r.qty,
      nullif(btrim(COALESCE(p_reason,'')),''), NULL, auth.uid(), 'rpc'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('items', v_count);
END; $$;
