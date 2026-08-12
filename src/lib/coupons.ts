import { supabase } from "@/integrations/supabase/client";

export type Coupon = {
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

export async function validateCoupon(code: string, subtotal: number) {
  const clean = code.trim().toUpperCase();
  const { data, error } = await supabase.from("coupons").select("*").eq("code", clean).maybeSingle();
  if (error) throw error;
  const coupon = data as Coupon | null;
  if (!coupon || !coupon.is_active) return { ok: false as const, message: "Cupom inválido." };
  const now = Date.now();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now)
    return { ok: false as const, message: "Cupom ainda não está válido." };
  if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now)
    return { ok: false as const, message: "Cupom expirado." };
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses)
    return { ok: false as const, message: "Cupom esgotado." };
  if (subtotal < Number(coupon.min_order))
    return { ok: false as const, message: `Pedido mínimo de R$ ${Number(coupon.min_order).toFixed(2)} para este cupom.` };
  return { ok: true as const, coupon };
}

export function couponDiscount(coupon: Coupon | null, subtotal: number, deliveryFee: number) {
  if (!coupon) return { discount: 0, freeShipping: false };
  if (coupon.discount_type === "free_shipping") return { discount: deliveryFee, freeShipping: true };
  if (coupon.discount_type === "percent")
    return { discount: (subtotal * Number(coupon.discount_value)) / 100, freeShipping: false };
  return { discount: Math.min(Number(coupon.discount_value), subtotal), freeShipping: false };
}
