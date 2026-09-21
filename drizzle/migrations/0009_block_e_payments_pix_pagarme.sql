-- ============ 1. Segredo de servidor + PIN endurecido ============
CREATE TABLE IF NOT EXISTS public.app_server_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_server_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_server_secrets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pin_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v text;
BEGIN
  SELECT value INTO v FROM public.app_server_secrets WHERE key = 'delivery_pin_hmac';
  IF v IS NULL THEN
    v := encode(extensions.digest(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'sha256'), 'hex');
    INSERT INTO public.app_server_secrets (key, value) VALUES ('delivery_pin_hmac', v)
      ON CONFLICT (key) DO NOTHING;
    SELECT value INTO v FROM public.app_server_secrets WHERE key = 'delivery_pin_hmac';
  END IF;
  RETURN v;
END; $$;
REVOKE ALL ON FUNCTION public.pin_secret() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hash_delivery_pin_secure(_order_id uuid, _pin text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN encode(extensions.hmac(_order_id::text || ':' || btrim(_pin), public.pin_secret(), 'sha256'), 'hex');
END; $$;
REVOKE ALL ON FUNCTION public.hash_delivery_pin_secure(uuid, text) FROM PUBLIC, anon, authenticated;

-- regrava hashes a partir do texto ainda existente
UPDATE public.orders o
   SET delivery_pin_hash = public.hash_delivery_pin_secure(o.id, p.pin)
  FROM public.order_delivery_pins p
 WHERE p.order_id = o.id;

-- apaga texto puro de pedidos finalizados
DELETE FROM public.order_delivery_pins p
 USING public.orders o
 WHERE o.id = p.order_id AND o.status IN ('entregue','cancelado');

CREATE OR REPLACE FUNCTION public.purge_delivery_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IN ('entregue','cancelado') AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM public.order_delivery_pins WHERE order_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_purge_delivery_pin ON public.orders;
CREATE TRIGGER trg_purge_delivery_pin
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.purge_delivery_pin();

-- ============ 2. Colunas de pagamento ============
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS provider_order_id text,
  ADD COLUMN IF NOT EXISTS provider_charge_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconcile_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconcile_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_charge_uidx
  ON public.payments (provider, provider_charge_id)
  WHERE provider_charge_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_live_online_uidx
  ON public.payments (order_id)
  WHERE provider = 'pagarme' AND status IN ('pendente','aguardando_pagamento');

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_client_request_uidx
  ON public.orders (user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'pagarme',
  event_id text,
  event_type text,
  provider_charge_id text,
  resolved_status text,
  amount numeric(10,2),
  currency text,
  summary jsonb,
  applied boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_unique_event
  ON public.payment_events (provider, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_events_order_idx ON public.payment_events (order_id, created_at DESC);

GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_events_select_admin ON public.payment_events;
CREATE POLICY payment_events_select_admin ON public.payment_events
  FOR SELECT TO authenticated USING (public.is_admin());

-- ============ 3. Precedência de estados de pagamento ============
CREATE OR REPLACE FUNCTION public.payment_status_rank(_status text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE _status
    WHEN 'pendente' THEN 0
    WHEN 'aguardando_pagamento' THEN 1
    WHEN 'expirado' THEN 2
    WHEN 'falhou' THEN 2
    WHEN 'cancelado' THEN 2
    WHEN 'pago' THEN 3
    WHEN 'estornado' THEN 4
    ELSE -1 END
$$;

-- ============ 4. create_order com PIX + idempotência ============
CREATE OR REPLACE FUNCTION public.create_order(
  p_address_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_notes text DEFAULT NULL::text,
  p_change_for text DEFAULT NULL::text,
  p_coupon_code text DEFAULT NULL::text,
  p_client_request_id text DEFAULT NULL::text
)
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
    v_notes, to_jsonb(v_addr), v_profile.full_name, v_profile.phone, v_zone.eta_minutes, v_key
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
END; $function$;

REVOKE ALL ON FUNCTION public.create_order(uuid, text, jsonb, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, jsonb, text, text, text, text) TO authenticated;

-- ============ 5. Funções de servidor (apenas service_role) ============
CREATE OR REPLACE FUNCTION public.payment_prepare_charge(p_order_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_pay public.payments%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;
  IF p_user_id IS NOT NULL AND v_order.user_id <> p_user_id THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF v_order.payment_method <> 'pix' THEN RAISE EXCEPTION 'PAGAMENTO_INVALIDO'; END IF;
  IF v_order.status IN ('cancelado') THEN RAISE EXCEPTION 'PEDIDO_FINALIZADO'; END IF;

  SELECT * INTO v_pay FROM public.payments
   WHERE order_id = v_order.id AND provider = 'pagarme'
   ORDER BY created_at DESC LIMIT 1;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'PAGAMENTO_NAO_ENCONTRADO'; END IF;

  RETURN jsonb_build_object(
    'payment_id', v_pay.id,
    'order_number', v_order.order_number,
    'status', v_pay.status,
    'amount', v_pay.amount,
    'currency', v_pay.currency,
    'provider_charge_id', v_pay.provider_charge_id,
    'expires_at', v_pay.expires_at,
    'qr_code', v_pay.pix_qr_code,
    'copy_paste', v_pay.pix_copy_paste,
    'customer_name', v_order.customer_name,
    'customer_phone', v_order.customer_phone,
    'live', (v_pay.status IN ('pendente','aguardando_pagamento')
             AND (v_pay.expires_at IS NULL OR v_pay.expires_at > now())
             AND v_pay.provider_charge_id IS NOT NULL)
  );
END; $$;
REVOKE ALL ON FUNCTION public.payment_prepare_charge(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.payment_attach_charge(
  p_payment_id uuid,
  p_provider_order_id text,
  p_provider_charge_id text,
  p_qr text,
  p_copy text,
  p_expires_at timestamptz,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_pay public.payments%ROWTYPE;
BEGIN
  UPDATE public.payments SET
    provider = 'pagarme',
    provider_order_id = p_provider_order_id,
    provider_charge_id = p_provider_charge_id,
    pix_qr_code = p_qr,
    pix_copy_paste = p_copy,
    expires_at = p_expires_at,
    idempotency_key = COALESCE(idempotency_key, p_idempotency_key),
    external_id = p_provider_charge_id,
    status = CASE WHEN public.payment_status_rank(status) <= 1 THEN 'aguardando_pagamento' ELSE status END,
    last_event_at = now()
  WHERE id = p_payment_id
  RETURNING * INTO v_pay;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'PAGAMENTO_NAO_ENCONTRADO'; END IF;

  UPDATE public.orders SET payment_status = 'aguardando_pagamento', updated_at = now()
   WHERE id = v_pay.order_id AND public.payment_status_rank(payment_status) <= 1;

  RETURN jsonb_build_object('payment_id', v_pay.id, 'status', v_pay.status);
END; $$;
REVOKE ALL ON FUNCTION public.payment_attach_charge(uuid, text, text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.payment_apply_status(
  p_provider_charge_id text,
  p_status text,
  p_amount_cents bigint,
  p_currency text,
  p_event_id text,
  p_event_type text,
  p_summary jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pay public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_amount numeric(10,2) := round(COALESCE(p_amount_cents,0)::numeric / 100.0, 2);
  v_applied boolean := false;
  v_note text := NULL;
BEGIN
  IF p_status NOT IN ('aguardando_pagamento','pago','expirado','falhou','cancelado','estornado') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO';
  END IF;

  SELECT * INTO v_pay FROM public.payments
   WHERE provider = 'pagarme' AND provider_charge_id = p_provider_charge_id FOR UPDATE;

  IF v_pay.id IS NULL THEN
    INSERT INTO public.payment_events (provider, event_id, event_type, provider_charge_id, resolved_status, amount, currency, summary, applied, note)
    VALUES ('pagarme', p_event_id, p_event_type, p_provider_charge_id, p_status, v_amount, p_currency, p_summary, false, 'COBRANCA_DESCONHECIDA')
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok', false, 'code', 'COBRANCA_DESCONHECIDA');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_pay.order_id FOR UPDATE;

  IF p_status = 'pago' AND (v_amount <> v_pay.amount OR COALESCE(p_currency,'BRL') <> COALESCE(v_pay.currency,'BRL')) THEN
    UPDATE public.payments SET reconcile_flag = true,
      reconcile_reason = 'Valor ou moeda divergente: recebido ' || v_amount || ' ' || COALESCE(p_currency,'?'),
      last_event_at = now()
     WHERE id = v_pay.id;
    v_note := 'VALOR_DIVERGENTE';
  ELSIF public.payment_status_rank(p_status) <= public.payment_status_rank(v_pay.status) THEN
    v_note := 'FORA_DE_ORDEM';
  ELSE
    UPDATE public.payments SET
      status = p_status,
      paid_at = CASE WHEN p_status = 'pago' THEN COALESCE(paid_at, now()) ELSE paid_at END,
      failed_at = CASE WHEN p_status = 'falhou' THEN COALESCE(failed_at, now()) ELSE failed_at END,
      canceled_at = CASE WHEN p_status IN ('cancelado','expirado') THEN COALESCE(canceled_at, now()) ELSE canceled_at END,
      refunded_at = CASE WHEN p_status = 'estornado' THEN COALESCE(refunded_at, now()) ELSE refunded_at END,
      refunded_amount = CASE WHEN p_status = 'estornado' THEN COALESCE(refunded_amount, v_amount) ELSE refunded_amount END,
      last_event_at = now()
    WHERE id = v_pay.id;
    v_applied := true;

    IF p_status = 'pago' THEN
      IF v_order.status = 'aguardando_pagamento' THEN
        UPDATE public.orders SET status = 'novo', payment_status = 'pago', updated_at = now() WHERE id = v_order.id;
      ELSIF v_order.status = 'cancelado' THEN
        UPDATE public.payments SET reconcile_flag = true,
          reconcile_reason = 'Pagamento confirmado após cancelamento do pedido' WHERE id = v_pay.id;
        UPDATE public.orders SET payment_status = 'pago', updated_at = now() WHERE id = v_order.id;
        v_note := 'PAGO_APOS_CANCELAMENTO';
      ELSE
        UPDATE public.orders SET payment_status = 'pago', updated_at = now() WHERE id = v_order.id;
      END IF;
    ELSIF p_status IN ('expirado','falhou','cancelado') THEN
      UPDATE public.orders SET payment_status = p_status, updated_at = now() WHERE id = v_order.id;
      IF v_order.status = 'aguardando_pagamento' THEN
        UPDATE public.orders SET status = 'cancelado', updated_at = now() WHERE id = v_order.id;
      END IF;
    ELSIF p_status = 'estornado' THEN
      UPDATE public.orders SET payment_status = 'estornado', updated_at = now() WHERE id = v_order.id;
    END IF;
  END IF;

  INSERT INTO public.payment_events (payment_id, order_id, provider, event_id, event_type, provider_charge_id, resolved_status, amount, currency, summary, applied, note)
  VALUES (v_pay.id, v_pay.order_id, 'pagarme', p_event_id, p_event_type, p_provider_charge_id, p_status, v_amount, p_currency, p_summary, v_applied, v_note)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'applied', v_applied, 'note', v_note, 'order_id', v_pay.order_id);
END; $$;
REVOKE ALL ON FUNCTION public.payment_apply_status(text, text, bigint, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.payment_expire_due()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r RECORD; v_count int := 0;
BEGIN
  FOR r IN
    SELECT p.id, p.order_id FROM public.payments p
     WHERE p.provider = 'pagarme'
       AND p.status IN ('pendente','aguardando_pagamento')
       AND p.expires_at IS NOT NULL
       AND p.expires_at < now() - interval '2 minutes'
  LOOP
    UPDATE public.payments SET status = 'expirado', canceled_at = COALESCE(canceled_at, now()), last_event_at = now()
     WHERE id = r.id;
    UPDATE public.orders SET payment_status = 'expirado',
           status = CASE WHEN status = 'aguardando_pagamento' THEN 'cancelado' ELSE status END,
           updated_at = now()
     WHERE id = r.order_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('expired', v_count);
END; $$;
REVOKE ALL ON FUNCTION public.payment_expire_due() FROM PUBLIC, anon, authenticated;

-- ============ 6. Listagem admin de pagamentos ============
CREATE OR REPLACE FUNCTION public.admin_payments(
  p_status text DEFAULT NULL,
  p_method text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid, order_id uuid, order_number integer, provider text, method text,
  status text, amount numeric, currency text, provider_charge_id text,
  expires_at timestamptz, paid_at timestamptz, reconcile_flag boolean,
  reconcile_reason text, customer_name text, order_status text, created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  RETURN QUERY
  SELECT p.id, p.order_id, o.order_number, p.provider, p.method, p.status, p.amount, p.currency,
         p.provider_charge_id, p.expires_at, p.paid_at, p.reconcile_flag, p.reconcile_reason,
         o.customer_name, o.status, p.created_at
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
   WHERE (p_status IS NULL OR p.status = p_status)
     AND (p_method IS NULL OR p.method = p_method)
     AND (p_from IS NULL OR p.created_at >= p_from)
     AND (p_to IS NULL OR p.created_at <= p_to)
   ORDER BY p.created_at DESC
   LIMIT COALESCE(p_limit, 50) OFFSET COALESCE(p_offset, 0);
END; $$;
REVOKE ALL ON FUNCTION public.admin_payments(text, text, timestamptz, timestamptz, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_payments(text, text, timestamptz, timestamptz, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_payment_manual_settle(p_payment_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_pay public.payments%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF nullif(btrim(COALESCE(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'PAGAMENTO_NAO_ENCONTRADO'; END IF;
  IF v_pay.status = 'pago' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  UPDATE public.payments SET status = 'pago', paid_at = COALESCE(paid_at, now()),
         reconcile_flag = true, reconcile_reason = 'Baixa manual: ' || btrim(p_reason), last_event_at = now()
   WHERE id = v_pay.id;
  UPDATE public.orders SET payment_status = 'pago',
         status = CASE WHEN status = 'aguardando_pagamento' THEN 'novo' ELSE status END,
         updated_at = now()
   WHERE id = v_pay.order_id;

  INSERT INTO public.payment_events (payment_id, order_id, provider, event_type, provider_charge_id, resolved_status, amount, currency, applied, note)
  VALUES (v_pay.id, v_pay.order_id, v_pay.provider, 'admin.manual_settle', v_pay.provider_charge_id, 'pago', v_pay.amount, v_pay.currency, true, btrim(p_reason));

  RETURN jsonb_build_object('ok', true, 'already', false);
END; $$;
REVOKE ALL ON FUNCTION public.admin_payment_manual_settle(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_payment_manual_settle(uuid, text) TO authenticated;

-- ============ 7. driver_complete_delivery com hash novo ============
CREATE OR REPLACE FUNCTION public.driver_complete_delivery(p_order_id uuid, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_driver public.delivery_drivers%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_attempts int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NAO_AUTENTICADO'; END IF;
  SELECT * INTO v_driver FROM public.delivery_drivers WHERE user_id = v_user AND is_active = true;
  IF v_driver.id IS NULL THEN RAISE EXCEPTION 'ENTREGADOR_NAO_CADASTRADO'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'; END IF;
  IF v_order.driver_id IS NULL OR v_order.driver_id <> v_driver.id THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;

  IF v_order.status = 'entregue' THEN
    RETURN jsonb_build_object('ok', true, 'order_id', v_order.id, 'status', 'entregue', 'already', true);
  END IF;
  IF v_order.status <> 'saiu_para_entrega' THEN RAISE EXCEPTION 'PEDIDO_NAO_DISPONIVEL'; END IF;
  IF v_order.pin_attempts >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PIN_BLOQUEADO', 'attempts', v_order.pin_attempts);
  END IF;

  IF v_order.delivery_pin_hash IS NULL
     OR v_order.delivery_pin_hash <> public.hash_delivery_pin_secure(v_order.id, COALESCE(p_pin,'')) THEN
    UPDATE public.orders SET pin_attempts = pin_attempts + 1 WHERE id = v_order.id
      RETURNING pin_attempts INTO v_attempts;
    RETURN jsonb_build_object(
      'ok', false,
      'code', CASE WHEN v_attempts >= 5 THEN 'PIN_BLOQUEADO' ELSE 'PIN_INVALIDO' END,
      'attempts', v_attempts
    );
  END IF;

  UPDATE public.orders
     SET status = 'entregue', delivered_at = now(), delivery_confirmed_by = 'pin', pin_attempts = 0
   WHERE id = v_order.id;

  INSERT INTO public.order_assignment_events (order_id, driver_id, action, actor_user_id)
  VALUES (v_order.id, v_driver.id, 'deliver_pin', v_user);

  RETURN jsonb_build_object('ok', true, 'order_id', v_order.id, 'status', 'entregue', 'already', false);
END; $function$;

-- ============ 8. Dashboard: pedidos aguardando pagamento ============
CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'SEM_PERMISSAO';
  END IF;

  SELECT jsonb_build_object(
    'orders_today', (SELECT count(*) FROM public.orders WHERE created_at >= v_start),
    'revenue_today', (SELECT COALESCE(sum(total),0) FROM public.orders WHERE created_at >= v_start AND status NOT IN ('cancelado','aguardando_pagamento')),
    'delivered_today', (SELECT count(*) FROM public.orders WHERE created_at >= v_start AND status = 'entregue'),
    'revenue_delivered_today', (SELECT COALESCE(sum(total),0) FROM public.orders WHERE created_at >= v_start AND status = 'entregue'),
    'canceled_today', (SELECT count(*) FROM public.orders WHERE created_at >= v_start AND status = 'cancelado'),
    'avg_ticket_today', (SELECT COALESCE(avg(total),0) FROM public.orders WHERE created_at >= v_start AND status NOT IN ('cancelado','aguardando_pagamento')),
    'awaiting_payment', (SELECT count(*) FROM public.orders WHERE status = 'aguardando_pagamento'),
    'open_new', (SELECT count(*) FROM public.orders WHERE status IN ('novo','confirmado')),
    'open_preparing', (SELECT count(*) FROM public.orders WHERE status = 'em_preparo'),
    'open_ready', (SELECT count(*) FROM public.orders WHERE status = 'pronto'),
    'open_route', (SELECT count(*) FROM public.orders WHERE status = 'saiu_para_entrega'),
    'low_stock', (SELECT count(*) FROM public.products WHERE is_active = true AND stock <= min_stock),
    'out_of_stock', (SELECT count(*) FROM public.products WHERE is_active = true AND stock <= 0),
    'active_products', (SELECT count(*) FROM public.products WHERE is_active = true),
    'active_drivers', (SELECT count(*) FROM public.delivery_drivers WHERE is_active = true),
    'customers', (SELECT count(*) FROM public.profiles),
    'store_open', (SELECT is_open FROM public.store_settings WHERE id = 1)
  ) INTO v_result;

  RETURN v_result;
END; $function$;