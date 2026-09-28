-- REVIEW ONLY: deploy with coordinate-confirmation UI and approved address validation.
-- Preserves original driver-only SECURITY DEFINER logic.
CREATE OR REPLACE FUNCTION public.driver_my_orders()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'reference', o.address_snapshot->>'reference',
        'latitude', CASE WHEN jsonb_typeof(o.address_snapshot->'latitude') = 'number' THEN (o.address_snapshot->>'latitude')::double precision END,
        'longitude', CASE WHEN jsonb_typeof(o.address_snapshot->'longitude') = 'number' THEN (o.address_snapshot->>'longitude')::double precision END
      ),
      'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', oi.id, 'name', oi.product_name, 'quantity', oi.quantity) ORDER BY oi.product_name), '[]'::jsonb)
                  FROM public.order_items oi WHERE oi.order_id = o.id)
    ) AS x
      FROM public.orders o
     WHERE o.driver_id = v_driver.id AND o.status = 'saiu_para_entrega'
  ) s;

  RETURN v_result;
END; $function$
;
