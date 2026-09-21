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

  RETURN jsonb_build_object('product_id', p_product_id, 'stock', (v_res->>'stock')::int);
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

  RETURN jsonb_build_object('product_id', p_product_id, 'stock', (v_res->>'stock')::int);
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
    'stock', (v_res->>'stock')::int,
    'changed', COALESCE((v_res->>'changed')::boolean, false)
  );
END; $$;
