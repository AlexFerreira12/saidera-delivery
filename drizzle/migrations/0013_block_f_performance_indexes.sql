CREATE INDEX IF NOT EXISTS orders_user_created_idx
  ON public.orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS products_category_active_idx
  ON public.products (category_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS products_name_lower_idx
  ON public.products (lower(name));

CREATE INDEX IF NOT EXISTS payments_order_idx
  ON public.payments (order_id, created_at DESC);