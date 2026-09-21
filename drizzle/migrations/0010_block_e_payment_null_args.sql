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
    provider_order_id = nullif(p_provider_order_id, ''),
    provider_charge_id = nullif(p_provider_charge_id, ''),
    pix_qr_code = nullif(p_qr, ''),
    pix_copy_paste = nullif(p_copy, ''),
    expires_at = p_expires_at,
    idempotency_key = COALESCE(idempotency_key, nullif(p_idempotency_key, '')),
    external_id = nullif(p_provider_charge_id, ''),
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
  v_event text := nullif(btrim(COALESCE(p_event_id,'')), '');
BEGIN
  IF p_status NOT IN ('aguardando_pagamento','pago','expirado','falhou','cancelado','estornado') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO';
  END IF;

  SELECT * INTO v_pay FROM public.payments
   WHERE provider = 'pagarme' AND provider_charge_id = p_provider_charge_id FOR UPDATE;

  IF v_pay.id IS NULL THEN
    INSERT INTO public.payment_events (provider, event_id, event_type, provider_charge_id, resolved_status, amount, currency, summary, applied, note)
    VALUES ('pagarme', v_event, p_event_type, p_provider_charge_id, p_status, v_amount, p_currency, p_summary, false, 'COBRANCA_DESCONHECIDA')
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
  VALUES (v_pay.id, v_pay.order_id, 'pagarme', v_event, p_event_type, p_provider_charge_id, p_status, v_amount, p_currency, p_summary, v_applied, v_note)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'applied', v_applied, 'note', v_note, 'order_id', v_pay.order_id);
END; $$;
REVOKE ALL ON FUNCTION public.payment_apply_status(text, text, bigint, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;