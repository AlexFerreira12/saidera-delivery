CREATE TABLE IF NOT EXISTS public.public_rate_limits (
  bucket text NOT NULL,
  identifier text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT date_trunc('minute', now()),
  hits integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, identifier, window_start)
);

GRANT ALL ON public.public_rate_limits TO service_role;
ALTER TABLE public.public_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_rate_limits_admin_read ON public.public_rate_limits
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS public_rate_limits_window_idx
  ON public.public_rate_limits (window_start);

CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_bucket text,
  p_identifier text,
  p_limit integer,
  p_window_seconds integer DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window timestamptz;
  v_hits integer;
BEGIN
  v_window := to_timestamp(floor(extract(epoch FROM now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1));
  INSERT INTO public.public_rate_limits (bucket, identifier, window_start, hits, updated_at)
  VALUES (p_bucket, coalesce(nullif(p_identifier, ''), 'desconhecido'), v_window, 1, now())
  ON CONFLICT (bucket, identifier, window_start)
  DO UPDATE SET hits = public.public_rate_limits.hits + 1, updated_at = now()
  RETURNING hits INTO v_hits;

  DELETE FROM public.public_rate_limits
   WHERE window_start < now() - interval '1 day';

  RETURN jsonb_build_object('allowed', v_hits <= p_limit, 'hits', v_hits, 'limit', p_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.purge_old_audit_data(p_days integer DEFAULT 180)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_events int; v_assign int;
BEGIN
  DELETE FROM public.payment_events WHERE created_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_events = ROW_COUNT;
  DELETE FROM public.order_assignment_events WHERE created_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_assign = ROW_COUNT;
  DELETE FROM public.public_rate_limits WHERE window_start < now() - interval '1 day';
  RETURN jsonb_build_object('payment_events', v_events, 'assignment_events', v_assign);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_audit_data(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_audit_data(integer) TO service_role;