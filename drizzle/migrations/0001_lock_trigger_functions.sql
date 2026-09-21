REVOKE ALL ON FUNCTION public.apply_stock_movement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_order_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;