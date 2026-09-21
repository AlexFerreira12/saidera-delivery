-- Painel operacional: funções administrativas (sempre com verificação explícita de admin)

CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'SEM_PERMISSAO';
  END IF;

  SELECT jsonb_build_object(
    'orders_today', (SELECT count(*) FROM public.orders WHERE created_at >= v_start),
    'revenue_today', (SELECT COALESCE(sum(total),0) FROM public.orders WHERE created_at >= v_start AND status <> 'cancelado'),
    'delivered_today', (SELECT count(*) FROM public.orders WHERE created_at >= v_start AND status = 'entregue'),
    'revenue_delivered_today', (SELECT COALESCE(sum(total),0) FROM public.orders WHERE created_at >= v_start AND status = 'entregue'),
    'canceled_today', (SELECT count(*) FROM public.orders WHERE created_at >= v_start AND status = 'cancelado'),
    'avg_ticket_today', (SELECT COALESCE(avg(total),0) FROM public.orders WHERE created_at >= v_start AND status <> 'cancelado'),
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
END; $$;

CREATE OR REPLACE FUNCTION public.admin_customers(p_search text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  full_name text,
  phone text,
  email text,
  created_at timestamptz,
  orders_count bigint,
  orders_total numeric,
  last_order_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_term text := nullif(btrim(COALESCE(p_search, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'SEM_PERMISSAO';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.phone, p.email, p.created_at,
         COALESCE(o.cnt, 0) AS orders_count,
         COALESCE(o.sum_total, 0)::numeric AS orders_total,
         o.last_at AS last_order_at
    FROM public.profiles p
    LEFT JOIN (
      SELECT user_id, count(*) AS cnt, sum(total) AS sum_total, max(created_at) AS last_at
        FROM public.orders WHERE status <> 'cancelado' GROUP BY user_id
    ) o ON o.user_id = p.id
   WHERE v_term IS NULL
      OR p.full_name ILIKE '%' || v_term || '%'
      OR p.phone ILIKE '%' || v_term || '%'
      OR p.email ILIKE '%' || v_term || '%'
   ORDER BY COALESCE(o.last_at, p.created_at) DESC
   LIMIT 200;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_driver_stats()
RETURNS TABLE (
  driver_id uuid,
  in_route bigint,
  delivered bigint,
  last_delivery_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'SEM_PERMISSAO';
  END IF;

  RETURN QUERY
  SELECT d.id,
         count(*) FILTER (WHERE o.status = 'saiu_para_entrega') AS in_route,
         count(*) FILTER (WHERE o.status = 'entregue') AS delivered,
         max(o.updated_at) FILTER (WHERE o.status = 'entregue') AS last_delivery_at
    FROM public.delivery_drivers d
    LEFT JOIN public.orders o ON o.driver_id = d.id
   GROUP BY d.id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_link_driver(
  p_email text,
  p_name text,
  p_phone text DEFAULT NULL,
  p_vehicle text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_driver public.delivery_drivers%ROWTYPE;
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_name text := nullif(btrim(COALESCE(p_name, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'SEM_PERMISSAO';
  END IF;
  IF v_email = '' THEN
    RAISE EXCEPTION 'EMAIL_OBRIGATORIO';
  END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'USUARIO_NAO_ENCONTRADO';
  END IF;

  SELECT * INTO v_driver FROM public.delivery_drivers WHERE user_id = v_uid;
  IF v_driver.id IS NOT NULL THEN
    RAISE EXCEPTION 'ENTREGADOR_JA_VINCULADO';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'driver')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.delivery_drivers (user_id, name, phone, vehicle, is_active)
  VALUES (
    v_uid,
    COALESCE(v_name, (SELECT full_name FROM public.profiles WHERE id = v_uid), v_email),
    nullif(btrim(COALESCE(p_phone, '')), ''),
    nullif(btrim(COALESCE(p_vehicle, '')), ''),
    true
  )
  RETURNING * INTO v_driver;

  RETURN jsonb_build_object('driver_id', v_driver.id, 'user_id', v_uid, 'name', v_driver.name);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_unlink_driver(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_driver public.delivery_drivers%ROWTYPE;
  v_open int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'SEM_PERMISSAO';
  END IF;

  SELECT * INTO v_driver FROM public.delivery_drivers WHERE id = p_driver_id;
  IF v_driver.id IS NULL THEN
    RAISE EXCEPTION 'ENTREGADOR_NAO_ENCONTRADO';
  END IF;

  SELECT count(*) INTO v_open FROM public.orders
   WHERE driver_id = v_driver.id AND status NOT IN ('entregue','cancelado');
  IF v_open > 0 THEN
    RAISE EXCEPTION 'ENTREGADOR_COM_ENTREGAS';
  END IF;

  UPDATE public.delivery_drivers SET is_active = false WHERE id = v_driver.id;
  DELETE FROM public.user_roles WHERE user_id = v_driver.user_id AND role = 'driver';

  RETURN jsonb_build_object('driver_id', v_driver.id, 'is_active', false);
END; $$;

REVOKE ALL ON FUNCTION public.admin_dashboard_metrics() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_customers(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_driver_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_link_driver(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_unlink_driver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_customers(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_driver_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_link_driver(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlink_driver(uuid) TO authenticated;
