import { supabase } from "@/integrations/supabase/client";
import type { PriceTier } from "@/lib/pricing";
import type { CartItem } from "@/hooks/useCart";

export type Product = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  brand: string | null;
  volume: string | null;
  image_url: string | null;
  price: number;
  promo_price: number | null;
  stock: number;
  min_stock: number;
  unit: string;
  temperature: string;
  is_featured: boolean;
  is_active: boolean;
  is_combo: boolean;
  combo_original_price: number | null;
  category_id: string | null;
  sku: string | null;
  barcode: string | null;
  cost: number | null;
  categories?: { name: string; slug: string } | null;
  promotions?: PriceTier[] | null;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  icon: string | null;
};

const PRODUCT_SELECT = "*, categories(name, slug), promotions(min_quantity, unit_price, label)";

export const withTiers = (p: Product) => ({ ...p, tiers: (p.promotions ?? []) as PriceTier[] });

export async function fetchCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function fetchProducts(params?: {
  categorySlug?: string;
  search?: string;
  featured?: boolean;
}) {
  let query = supabase.from("products").select(PRODUCT_SELECT).eq("is_active", true).order("name");
  if (params?.featured) query = query.eq("is_featured", true);
  if (params?.search) query = query.ilike("name", `%${params.search}%`);
  const { data, error } = await query;
  if (error) throw error;
  let list = (data ?? []) as unknown as Product[];
  if (params?.categorySlug) list = list.filter((p) => p.categories?.slug === params.categorySlug);
  return list;
}

export async function fetchProductBySlug(slug: string) {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Product) ?? null;
}

export async function fetchStoreSettings() {
  const { data, error } = await supabase
    .from("store_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchDeliveryZones() {
  const { data, error } = await supabase
    .from("delivery_zones")
    .select("*")
    .eq("is_active", true)
    .order("neighborhood");
  if (error) throw error;
  return data ?? [];
}

export async function fetchBanners() {
  const { data, error } = await supabase
    .from("banners")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export function toCartItem(p: Product): Omit<CartItem, "quantity"> {
  return {
    id: p.id,
    name: p.name,
    image_url: p.image_url,
    volume: p.volume,
    price: Number(p.price),
    promo_price: p.promo_price != null ? Number(p.promo_price) : null,
    stock: p.stock,
    tiers: (p.promotions ?? []) as PriceTier[],
  };
}
