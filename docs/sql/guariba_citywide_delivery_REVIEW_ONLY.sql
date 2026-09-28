-- DRAFT ONLY. DEPLOY TO STAGING FIRST; DO NOT RUN ON PRODUCTION UNTIL REVIEW WORKFLOW AND CLIENT ARE READY.
-- Generated from current production pg_get_functiondef and reviewed targeted substitutions.
-- Existing stock, coupon, payment, idempotency and order PIN logic retained.
-- Adds explicit admin-reviewed eligibility, so unknown streets/loteamentos are not automatically rejected.
-- This SQL intentionally does not claim to geocode or verify municipal boundaries.

CREATE TABLE IF NOT EXISTS public.delivery_address_approvals (
  address_id uuid PRIMARY KEY REFERENCES public.addresses(id) ON DELETE CASCADE,
  approved boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  CONSTRAINT approval_requires_reviewer CHECK (NOT approved OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
ALTER TABLE public.delivery_address_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_address_approvals FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_address_approvals TO authenticated;
DROP POLICY IF EXISTS delivery_approvals_admin_only ON public.delivery_address_approvals;
CREATE POLICY delivery_approvals_admin_only ON public.delivery_address_approvals
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS delivery_approvals_owner_read ON public.delivery_address_approvals;
CREATE POLICY delivery_approvals_owner_read ON public.delivery_address_approvals
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.addresses a WHERE a.id = address_id AND a.user_id = auth.uid())
  );


CREATE OR REPLACE FUNCTION public.create_order(p_address_id uuid, p_payment_method text, p_items jsonb, p_notes text DEFAULT NULL::text, p_change_for text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text, p_client_request_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_addr public.addresses%ROWTYPE;
  v_store public.store_settings%ROWTYPE;
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
  v_key text := nullif(btrim(COALESCE(p_client_request_id,'')), '');
  v_is_pix boolean := (p_payment_method = 'pix');
  v_status text;
  v_paystatus text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NAO_AUTENTICADO'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'CARRINHO_VAZIO';
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE user_id = v_user AND client_request_id = v_key;
    IF v_order.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'order_id', v_order.id, 'order_number', v_order.order_number,
        'subtotal', v_order.subtotal, 'delivery_fee', v_order.delivery_fee,
        'discount', v_order.discount, 'total', v_order.total,
        'free_shipping', false, 'payment_method', v_order.payment_method,
        'requires_online_payment', v_order.payment_method = 'pix', 'duplicate', true
      );
    END IF;
  END IF;

  SELECT * INTO v_store FROM public.store_settings WHERE id = 1;
  IF v_store.id IS NULL OR v_store.is_open = false THEN RAISE EXCEPTION 'LOJA_FECHADA'; END IF;

  IF p_payment_method NOT IN ('dinheiro','cartao_entrega','pix') THEN
    RAISE EXCEPTION 'PAGAMENTO_INVALIDO';
  END IF;

  SELECT * INTO v_addr FROM public.addresses WHERE id = p_address_id;
  IF v_addr.id IS NULL OR v_addr.user_id <> v_user THEN RAISE EXCEPTION 'ENDERECO_INVALIDO'; END IF;

  IF lower(btrim(v_addr.city)) <> 'guariba' OR upper(btrim(v_addr.state)) <> 'SP' THEN
    RAISE EXCEPTION 'FORA_DA_AREA';
  END IF;
  -- Explicit admin review prevents rural/out-of-city addresses from passing
  -- simply because a user selected Guariba in the form.
  IF NOT EXISTS (
    SELECT 1 FROM public.delivery_address_approvals approval
    WHERE approval.address_id = v_addr.id AND approval.approved = true
  ) THEN
    RAISE EXCEPTION 'ENDERECO_PENDENTE';
  END IF;

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

  IF v_subtotal < v_store.min_order THEN RAISE EXCEPTION 'PEDIDO_MINIMO:%', v_store.min_order; END IF;

  v_fee := v_store.default_delivery_fee;
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
  IF v_is_pix AND v_total <= 0 THEN RAISE EXCEPTION 'VALOR_INVALIDO'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user;

  v_notes := nullif(btrim(concat_ws(' · ',
    nullif(btrim(COALESCE(p_notes, '')), ''),
    CASE WHEN p_payment_method = 'dinheiro' AND nullif(btrim(COALESCE(p_change_for,'')),'') IS NOT NULL
         THEN 'Troco para ' || btrim(p_change_for) END)), '');

  v_status := CASE WHEN v_is_pix THEN 'aguardando_pagamento' ELSE 'novo' END;
  v_paystatus := CASE WHEN v_is_pix THEN 'aguardando_pagamento' ELSE 'pendente' END;

  INSERT INTO public.orders (
    user_id, address_id, status, payment_method, payment_status,
    subtotal, delivery_fee, discount, total, coupon_code, notes,
    address_snapshot, customer_name, customer_phone, eta_minutes, client_request_id
  ) VALUES (
    v_user, v_addr.id, v_status, p_payment_method, v_paystatus,
    v_subtotal, v_fee, v_discount, v_total,
    CASE WHEN v_coupon.id IS NOT NULL THEN v_coupon.code END,
    v_notes, to_jsonb(v_addr), v_profile.full_name, v_profile.phone, v_store.avg_delivery_minutes, v_key
  ) RETURNING * INTO v_order;

  v_pin := lpad((floor(random() * 10000))::int::text, 4, '0');
  INSERT INTO public.order_delivery_pins (order_id, pin) VALUES (v_order.id, v_pin);
  UPDATE public.orders SET delivery_pin_hash = public.hash_delivery_pin_secure(v_order.id, v_pin) WHERE id = v_order.id;

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

  INSERT INTO public.payments (order_id, provider, method, status, amount, currency)
  VALUES (
    v_order.id,
    CASE WHEN v_is_pix THEN 'pagarme' ELSE 'na_entrega' END,
    p_payment_method,
    CASE WHEN v_is_pix THEN 'pendente' ELSE 'pendente' END,
    v_total, 'BRL'
  );

  RETURN jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number,
    'subtotal', v_subtotal, 'delivery_fee', v_fee, 'discount', v_discount,
    'total', v_total, 'free_shipping', v_free_shipping,
    'payment_method', p_payment_method,
    'requires_online_payment', v_is_pix, 'duplicate', false
  );
END; $function$
;
