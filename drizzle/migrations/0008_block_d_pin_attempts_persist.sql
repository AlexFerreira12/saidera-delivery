-- PIN inválido não pode abortar a transação (perderia a contagem de tentativas)
CREATE OR REPLACE FUNCTION public.driver_complete_delivery(p_order_id uuid, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
     OR v_order.delivery_pin_hash <> public.hash_delivery_pin(v_order.id, COALESCE(p_pin,'')) THEN
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