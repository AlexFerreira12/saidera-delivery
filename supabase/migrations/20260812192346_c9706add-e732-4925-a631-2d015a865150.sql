
-- ROLES
CREATE TYPE public.app_role AS ENUM ('customer','driver','admin');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  cpf text,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin()) WITH CHECK (true);

CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, cpf, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'phone', NEW.raw_user_meta_data->>'cpf', NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- CATALOG
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_public_read" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories_admin_write" ON public.categories FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text UNIQUE,
  description text,
  brand text,
  volume text,
  image_url text,
  sku text,
  barcode text,
  cost numeric(10,2),
  price numeric(10,2) NOT NULL DEFAULT 0,
  promo_price numeric(10,2),
  stock int NOT NULL DEFAULT 0,
  min_stock int NOT NULL DEFAULT 5,
  unit text NOT NULL DEFAULT 'un',
  temperature text NOT NULL DEFAULT 'ambiente',
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  is_combo boolean NOT NULL DEFAULT false,
  combo_original_price numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_admin_write" ON public.products FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.product_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT ALL ON public.product_images TO service_role;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_images_public_read" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "product_images_admin_write" ON public.product_images FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- quantity tier pricing / promotions
CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'quantity_price',
  min_quantity int NOT NULL DEFAULT 1,
  unit_price numeric(10,2),
  discount_percent numeric(5,2),
  discount_amount numeric(10,2),
  label text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.promotions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promotions_public_read" ON public.promotions FOR SELECT USING (true);
CREATE POLICY "promotions_admin_write" ON public.promotions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 1
);
GRANT SELECT ON public.combo_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.combo_items TO authenticated;
GRANT ALL ON public.combo_items TO service_role;
ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "combo_items_public_read" ON public.combo_items FOR SELECT USING (true);
CREATE POLICY "combo_items_admin_write" ON public.combo_items FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  image_url text,
  link_slug text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.banners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.banners TO authenticated;
GRANT ALL ON public.banners TO service_role;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "banners_public_read" ON public.banners FOR SELECT USING (true);
CREATE POLICY "banners_admin_write" ON public.banners FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- STORE
CREATE TABLE public.store_settings (
  id int PRIMARY KEY DEFAULT 1,
  store_name text NOT NULL DEFAULT 'Distribuidora',
  logo_url text,
  phone text,
  whatsapp text,
  address text,
  opening_hours text,
  min_order numeric(10,2) NOT NULL DEFAULT 20,
  avg_delivery_minutes int NOT NULL DEFAULT 35,
  free_delivery_above numeric(10,2) NOT NULL DEFAULT 80,
  default_delivery_fee numeric(10,2) NOT NULL DEFAULT 5.99,
  payment_methods text[] NOT NULL DEFAULT ARRAY['pix','credit','debit','cash'],
  is_open boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_settings_single_row CHECK (id = 1)
);
GRANT SELECT ON public.store_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_settings_public_read" ON public.store_settings FOR SELECT USING (true);
CREATE POLICY "store_settings_admin_write" ON public.store_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  neighborhood text NOT NULL,
  city text NOT NULL DEFAULT 'Guariba',
  state text NOT NULL DEFAULT 'SP',
  fee numeric(10,2) NOT NULL DEFAULT 5.99,
  min_order numeric(10,2) NOT NULL DEFAULT 20,
  eta_minutes int NOT NULL DEFAULT 35,
  is_active boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.delivery_zones TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.delivery_zones TO authenticated;
GRANT ALL ON public.delivery_zones TO service_role;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zones_public_read" ON public.delivery_zones FOR SELECT USING (true);
CREATE POLICY "zones_admin_write" ON public.delivery_zones FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Casa',
  zipcode text,
  street text NOT NULL,
  number text NOT NULL,
  complement text,
  neighborhood text NOT NULL,
  city text NOT NULL DEFAULT 'Guariba',
  state text NOT NULL DEFAULT 'SP',
  reference text,
  latitude double precision,
  longitude double precision,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT ALL ON public.addresses TO service_role;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addresses_own" ON public.addresses FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_admin()) WITH CHECK (user_id = auth.uid());

-- DRIVERS
CREATE TABLE public.delivery_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  vehicle text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_drivers TO authenticated;
GRANT ALL ON public.delivery_drivers TO service_role;
ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drivers_read" ON public.delivery_drivers FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "drivers_admin_write" ON public.delivery_drivers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- COUPONS
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'percent',
  discount_value numeric(10,2) NOT NULL DEFAULT 0,
  min_order numeric(10,2) NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses int,
  max_uses_per_user int NOT NULL DEFAULT 1,
  first_order_only boolean NOT NULL DEFAULT false,
  used_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coupons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupons_public_read" ON public.coupons FOR SELECT USING (is_active = true OR public.is_admin());
CREATE POLICY "coupons_admin_write" ON public.coupons FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ORDERS
CREATE SEQUENCE public.order_number_seq START 1001;
GRANT USAGE ON SEQUENCE public.order_number_seq TO authenticated, service_role;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number int NOT NULL UNIQUE DEFAULT nextval('public.order_number_seq'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address_id uuid REFERENCES public.addresses(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.delivery_drivers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'novo',
  payment_method text NOT NULL DEFAULT 'pix',
  payment_status text NOT NULL DEFAULT 'pendente',
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  discount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  coupon_code text,
  notes text,
  address_snapshot jsonb,
  customer_name text,
  customer_phone text,
  eta_minutes int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_order_driver(_order_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.delivery_drivers d ON d.id = o.driver_id
    WHERE o.id = _order_id AND d.user_id = auth.uid()
  )
$$;

CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_order_driver(id)
         OR (public.has_role(auth.uid(),'driver') AND driver_id IS NULL AND status IN ('pronto','saiu_para_entrega')));
CREATE POLICY "orders_insert_own" ON public.orders FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "orders_update" ON public.orders FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.has_role(auth.uid(),'driver') OR user_id = auth.uid()) WITH CHECK (true);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  image_url text,
  quantity int NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  total_price numeric(10,2) NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_order(_order_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = _order_id
    AND (o.user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'driver'))
  )
$$;
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT TO authenticated USING (public.can_view_order(order_id));
CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
);

CREATE TABLE public.order_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_status_events TO authenticated;
GRANT ALL ON public.order_status_events TO service_role;
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "status_events_select" ON public.order_status_events FOR SELECT TO authenticated USING (public.can_view_order(order_id));
CREATE POLICY "status_events_insert" ON public.order_status_events FOR INSERT TO authenticated WITH CHECK (public.can_view_order(order_id));

CREATE OR REPLACE FUNCTION public.log_order_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_events (order_id, status) VALUES (NEW.id, NEW.status);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER orders_status_log AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_status();

-- stock movement on status change
CREATE OR REPLACE FUNCTION public.apply_stock_movement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelado' AND OLD.status <> 'cancelado' THEN
    UPDATE public.products p SET stock = p.stock + oi.quantity
    FROM public.order_items oi WHERE oi.order_id = NEW.id AND oi.product_id = p.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER orders_stock_movement AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'pendente',
  method text NOT NULL DEFAULT 'pix',
  status text NOT NULL DEFAULT 'pendente',
  amount numeric(10,2) NOT NULL DEFAULT 0,
  external_id text,
  pix_qr_code text,
  pix_copy_paste text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select" ON public.payments FOR SELECT TO authenticated USING (public.can_view_order(order_id));
CREATE POLICY "payments_insert" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.can_view_order(order_id));
CREATE POLICY "payments_update_admin" ON public.payments FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.delivery_drivers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'atribuida',
  started_at timestamptz,
  delivered_at timestamptz,
  last_latitude double precision,
  last_longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deliveries_select" ON public.deliveries FOR SELECT TO authenticated USING (public.can_view_order(order_id));
CREATE POLICY "deliveries_write" ON public.deliveries FOR ALL TO authenticated
  USING (public.is_admin() OR public.has_role(auth.uid(),'driver')) WITH CHECK (public.is_admin() OR public.has_role(auth.uid(),'driver'));

CREATE TABLE public.coupon_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.coupon_usages TO authenticated;
GRANT ALL ON public.coupon_usages TO service_role;
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupon_usages_own" ON public.coupon_usages FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "coupon_usages_insert" ON public.coupon_usages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE TABLE public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favorites_own" ON public.favorites FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  type text NOT NULL DEFAULT 'pedido',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications_admin_insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE TABLE public.loyalty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.loyalty_accounts TO authenticated;
GRANT ALL ON public.loyalty_accounts TO service_role;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_own" ON public.loyalty_accounts FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE TABLE public.loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  points int NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'entrada',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.loyalty_transactions TO authenticated;
GRANT ALL ON public.loyalty_transactions TO service_role;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_tx_own" ON public.loyalty_transactions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- SEED
INSERT INTO public.store_settings (id, store_name, phone, whatsapp, address, opening_hours)
VALUES (1, 'Bebidas Guariba', '(16) 3251-0000', '5516999990000', 'Rua Principal, 100 - Centro, Guariba/SP', 'Seg a Dom, 09h às 23h');

INSERT INTO public.delivery_zones (neighborhood, fee, min_order, eta_minutes) VALUES
 ('Centro', 4.99, 20, 25),
 ('Jardim Alvorada', 6.99, 25, 35),
 ('Vila Aparecida', 6.99, 25, 35),
 ('Jardim Bela Vista', 7.99, 30, 45);

INSERT INTO public.categories (name, slug, sort_order) VALUES
 ('Refrigerantes','refrigerantes',1),
 ('Água','agua',2),
 ('Energéticos','energeticos',3),
 ('Sucos','sucos',4),
 ('Isotônicos','isotonicos',5),
 ('Gelo','gelo',6),
 ('Carvão','carvao',7),
 ('Petiscos','petiscos',8),
 ('Combos','combos',9),
 ('Promoções','promocoes',10);

INSERT INTO public.banners (title, subtitle, sort_order) VALUES
 ('Ofertas do dia','Bebidas geladas com preço de distribuidora',1),
 ('Entrega rápida','Seu pedido em até 35 minutos em Guariba',2),
 ('Combos de churrasco','Economize levando o kit completo',3);

INSERT INTO public.coupons (code, discount_type, discount_value, min_order, first_order_only) VALUES
 ('PRIMEIRACOMPRA','percent',10,30,true),
 ('FRETEGRATIS','free_shipping',0,60,false);

INSERT INTO public.products (category_id, name, slug, description, brand, volume, price, promo_price, stock, temperature, is_featured)
SELECT c.id, v.name, v.slug, v.description, v.brand, v.volume, v.price, v.promo_price, v.stock, v.temperature, v.featured
FROM (VALUES
 ('refrigerantes','Refrigerante Cola Original 2L','refri-cola-2l','Refrigerante de cola gelado, garrafa 2 litros.','Cola','2L',11.99,10.49,80,'gelado',true),
 ('refrigerantes','Refrigerante Guaraná 2L','refri-guarana-2l','Refrigerante de guaraná gelado.','Guaraná','2L',9.99,NULL,60,'gelado',true),
 ('refrigerantes','Refrigerante Laranja 600ml','refri-laranja-600','Refrigerante sabor laranja.','Citrus','600ml',5.49,NULL,50,'gelado',false),
 ('agua','Água Mineral sem Gás 1,5L','agua-15l','Água mineral natural.','Fonte Clara','1,5L',3.49,NULL,120,'ambiente',false),
 ('agua','Água com Gás 500ml','agua-gas-500','Água mineral gaseificada.','Fonte Clara','500ml',3.99,NULL,90,'gelado',false),
 ('energeticos','Energético Tradicional 473ml','energetico-473','Energético gelado lata 473ml.','Turbo','473ml',9.99,8.99,70,'gelado',true),
 ('energeticos','Energético Melancia 269ml','energetico-269','Energético sabor melancia.','Turbo','269ml',7.49,NULL,40,'gelado',false),
 ('sucos','Suco de Uva Integral 1L','suco-uva-1l','Suco integral sem açúcar.','Vinhedo','1L',14.90,NULL,30,'ambiente',false),
 ('isotonicos','Isotônico Limão 500ml','isotonico-limao','Repositor de eletrólitos.','Hidra','500ml',6.99,NULL,45,'gelado',false),
 ('gelo','Gelo em Cubos 5kg','gelo-5kg','Saco de gelo em cubos 5kg.','Polar','5kg',12.00,NULL,40,'gelado',true),
 ('carvao','Carvão Vegetal 5kg','carvao-5kg','Carvão de alto rendimento.','Brasa','5kg',24.90,21.90,25,'ambiente',true),
 ('petiscos','Amendoim Torrado 500g','amendoim-500','Amendoim crocante salgado.','Petisco Bom','500g',12.90,NULL,35,'ambiente',false),
 ('petiscos','Batata Frita Rústica 100g','batata-100','Salgadinho de batata.','Crock','100g',8.90,NULL,50,'ambiente',false)
) AS v(cat,name,slug,description,brand,volume,price,promo_price,stock,temperature,featured)
JOIN public.categories c ON c.slug = v.cat;

INSERT INTO public.promotions (product_id, type, min_quantity, unit_price, label)
SELECT p.id, 'quantity_price', q.minq, q.uprice, q.label
FROM (VALUES
 ('refri-cola-2l',3,10.99,'Leve 3 por R$ 10,99 cada'),
 ('refri-cola-2l',6,9.99,'Leve 6 por R$ 9,99 cada'),
 ('energetico-473',6,8.49,'Leve 6 por R$ 8,49 cada')
) AS q(slug,minq,uprice,label)
JOIN public.products p ON p.slug = q.slug;
