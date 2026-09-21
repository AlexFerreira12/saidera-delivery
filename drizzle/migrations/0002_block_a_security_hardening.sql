-- 1) ORDERS: direct UPDATE only for admin
DROP POLICY IF EXISTS orders_update_staff ON public.orders;
CREATE POLICY orders_update_admin ON public.orders
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2) ORDER_STATUS_EVENTS: no direct writes
DROP POLICY IF EXISTS status_events_insert ON public.order_status_events;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.order_status_events FROM anon, authenticated;
GRANT SELECT ON public.order_status_events TO authenticated;

-- 3) PRODUCTS: hide cost/sku/barcode from anon/authenticated column-level
REVOKE SELECT ON public.products FROM anon, authenticated;
GRANT SELECT (
  id, category_id, name, slug, description, brand, volume, image_url,
  price, promo_price, stock, min_stock, unit, temperature,
  is_featured, is_active, is_combo, combo_original_price, created_at, updated_at
) ON public.products TO anon, authenticated;

CREATE OR REPLACE VIEW public.products_admin
WITH (security_invoker = false) AS
  SELECT p.* FROM public.products p WHERE public.is_admin();
REVOKE ALL ON public.products_admin FROM PUBLIC, anon;
GRANT SELECT ON public.products_admin TO authenticated;

-- 4) COUPONS: no public/customer enumeration
DROP POLICY IF EXISTS coupons_public_read ON public.coupons;
CREATE POLICY coupons_admin_read ON public.coupons
  FOR SELECT TO authenticated
  USING (public.is_admin());
REVOKE ALL ON public.coupons FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_coupon(p_code text, p_subtotal numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_c public.coupons%ROWTYPE;
  v_uses int;
  v_prev int;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO');
  END IF;
  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CUPOM_INVALIDO');
  END IF;

  SELECT * INTO v_c FROM public.coupons WHERE code = upper(btrim(p_code));
  IF v_c.id IS NULL OR v_c.is_active = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CUPOM_INVALIDO');
  END IF;
  IF v_c.starts_at IS NOT NULL AND v_c.starts_at > now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CUPOM_NAO_VIGENTE');
  END IF;
  IF v_c.ends_at IS NOT NULL AND v_c.ends_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CUPOM_EXPIRADO');
  END IF;
  IF v_c.max_uses IS NOT NULL AND v_c.used_count >= v_c.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CUPOM_ESGOTADO');
  END IF;
  SELECT count(*) INTO v_uses FROM public.coupon_usages WHERE coupon_id = v_c.id AND user_id = v_user;
  IF v_uses >= v_c.max_uses_per_user THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CUPOM_JA_USADO');
  END IF;
  IF v_c.first_order_only THEN
    SELECT count(*) INTO v_prev FROM public.orders WHERE user_id = v_user AND status <> 'cancelado';
    IF v_prev > 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CUPOM_PRIMEIRA_COMPRA');
    END IF;
  END IF;
  IF COALESCE(p_subtotal, 0) < v_c.min_order THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CUPOM_MINIMO', 'min_order', v_c.min_order);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', v_c.code,
    'discount_type', v_c.discount_type,
    'discount_value', v_c.discount_value,
    'min_order', v_c.min_order
  );
END; $$;
REVOKE ALL ON FUNCTION public.preview_coupon(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_coupon(text, numeric) TO authenticated;

-- 5) PROFILES: ownership enforced on write
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- 6) set_order_status: driver restricted to own assigned order + delivery transitions
CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_is_driver boolean;
  v_driver public.delivery_drivers%ROWTYPE;
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

  IF NOT v_is_admin THEN
    SELECT * INTO v_driver FROM public.delivery_drivers WHERE user_id = v_user AND is_active = true;
    IF v_driver.id IS NULL THEN
      RAISE EXCEPTION 'ENTREGADOR_NAO_CADASTRADO';
    END IF;
    IF v_order.driver_id IS NULL OR v_order.driver_id <> v_driver.id THEN
      RAISE EXCEPTION 'SEM_PERMISSAO';
    END IF;
    IF NOT (
      (v_order.status = 'pronto' AND p_status = 'saiu_para_entrega')
      OR (v_order.status = 'saiu_para_entrega' AND p_status = 'entregue')
    ) THEN
      RAISE EXCEPTION 'SEM_PERMISSAO';
    END IF;
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

-- 7) EXECUTE grants on public RPCs: authenticated only
REVOKE ALL ON FUNCTION public.create_order(uuid, text, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, jsonb, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_order_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.accept_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_delivery(uuid) TO authenticated;
