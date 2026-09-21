import { supabase } from "@/integrations/supabase/client";

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const adminErrorMessage = (raw: unknown, fallback = "Não foi possível salvar.") => {
  const message =
    typeof raw === "string" ? raw : ((raw as { message?: string } | null)?.message ?? "");
  if (message.includes("SEM_PERMISSAO")) return "Você não tem permissão para esta ação.";
  if (message.includes("EMAIL_OBRIGATORIO")) return "Informe o e-mail do usuário.";
  if (message.includes("USUARIO_NAO_ENCONTRADO"))
    return "Nenhum usuário cadastrado com esse e-mail. Peça para ele criar a conta primeiro.";
  if (message.includes("ENTREGADOR_JA_VINCULADO")) return "Esse usuário já é entregador.";
  if (message.includes("ENTREGADOR_NAO_ENCONTRADO")) return "Entregador não encontrado.";
  if (message.includes("ENTREGADOR_COM_ENTREGAS"))
    return "Esse entregador ainda tem entregas em andamento.";
  if (message.includes("duplicate key")) return "Já existe um registro com esse valor.";
  return fallback;
};

/* ---------------- Dashboard ---------------- */

export type DashboardMetrics = {
  orders_today: number;
  revenue_today: number;
  delivered_today: number;
  revenue_delivered_today: number;
  canceled_today: number;
  avg_ticket_today: number;
  open_new: number;
  open_preparing: number;
  open_ready: number;
  open_route: number;
  low_stock: number;
  out_of_stock: number;
  active_products: number;
  active_drivers: number;
  customers: number;
  store_open: boolean | null;
};

export async function fetchDashboardMetrics() {
  const { data, error } = await supabase.rpc("admin_dashboard_metrics");
  if (error) throw error;
  return data as unknown as DashboardMetrics;
}

export type LowStockProduct = {
  id: string;
  name: string;
  stock: number;
  min_stock: number;
};

export async function fetchLowStock() {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, stock, min_stock")
    .eq("is_active", true)
    .order("stock")
    .limit(30);
  if (error) throw error;
  return ((data ?? []) as LowStockProduct[]).filter((p) => p.stock <= p.min_stock);
}

/* ---------------- Categorias ---------------- */

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
};

export async function fetchAdminCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, icon, sort_order, is_active")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as AdminCategory[];
}

export async function countProductsInCategory(categoryId: string) {
  const { count, error } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);
  if (error) throw error;
  return count ?? 0;
}

/* ---------------- Promoções ---------------- */

export type AdminPromotion = {
  id: string;
  product_id: string | null;
  type: string;
  min_quantity: number;
  unit_price: number | null;
  label: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  products?: { name: string } | null;
};

export async function fetchAdminPromotions() {
  const { data, error } = await supabase
    .from("promotions")
    .select(
      "id, product_id, type, min_quantity, unit_price, label, starts_at, ends_at, is_active, products(name)",
    )
    .order("min_quantity");
  if (error) throw error;
  return (data ?? []) as unknown as AdminPromotion[];
}

/* ---------------- Cupons ---------------- */

export type AdminCoupon = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  min_order: number;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  max_uses_per_user: number;
  first_order_only: boolean;
  used_count: number;
  is_active: boolean;
};

export async function fetchAdminCoupons() {
  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminCoupon[];
}

/* ---------------- Banners ---------------- */

export type AdminBanner = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_slug: string | null;
  sort_order: number;
  is_active: boolean;
};

export async function fetchAdminBanners() {
  const { data, error } = await supabase
    .from("banners")
    .select("id, title, subtitle, image_url, link_slug, sort_order, is_active")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as AdminBanner[];
}

/* ---------------- Zonas de entrega ---------------- */

export type AdminZone = {
  id: string;
  neighborhood: string;
  city: string;
  state: string;
  fee: number;
  min_order: number;
  eta_minutes: number;
  is_active: boolean;
};

export async function fetchAdminZones() {
  const { data, error } = await supabase
    .from("delivery_zones")
    .select("*")
    .order("neighborhood");
  if (error) throw error;
  return (data ?? []) as AdminZone[];
}

/* ---------------- Configurações ---------------- */

export type StoreSettings = {
  id: number;
  store_name: string;
  logo_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  opening_hours: string | null;
  min_order: number;
  avg_delivery_minutes: number;
  free_delivery_above: number;
  default_delivery_fee: number;
  is_open: boolean;
};

export async function fetchSettings() {
  const { data, error } = await supabase
    .from("store_settings")
    .select(
      "id, store_name, logo_url, phone, whatsapp, address, opening_hours, min_order, avg_delivery_minutes, free_delivery_above, default_delivery_fee, is_open",
    )
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data as StoreSettings | null;
}

/* ---------------- Clientes ---------------- */

export type AdminCustomer = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  orders_count: number;
  orders_total: number;
  last_order_at: string | null;
};

export async function fetchAdminCustomers(search: string) {
  const { data, error } = await supabase.rpc("admin_customers", {
    p_search: search.trim(),
  });
  if (error) throw error;
  return (data ?? []) as unknown as AdminCustomer[];
}

/* ---------------- Entregadores ---------------- */

export type AdminDriver = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  vehicle: string | null;
  is_active: boolean;
  created_at: string;
};

export type DriverStats = {
  driver_id: string;
  in_route: number;
  delivered: number;
  last_delivery_at: string | null;
};

export async function fetchAdminDrivers() {
  const [drivers, stats] = await Promise.all([
    supabase.from("delivery_drivers").select("*").order("name"),
    supabase.rpc("admin_driver_stats"),
  ]);
  if (drivers.error) throw drivers.error;
  if (stats.error) throw stats.error;
  return {
    drivers: (drivers.data ?? []) as AdminDriver[],
    stats: (stats.data ?? []) as unknown as DriverStats[],
  };
}
