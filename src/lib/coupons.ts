import { supabase } from "@/integrations/supabase/client";
import { checkoutErrorMessage } from "@/lib/checkout";

/** Estimativa retornada pela RPC segura. A validação final é feita em create_order. */
export type Coupon = {
  code: string;
  discount_type: string;
  discount_value: number;
  min_order: number;
};

type PreviewResult = {
  ok: boolean;
  code?: string;
  discount_type?: string;
  discount_value?: number;
  min_order?: number;
};

export async function validateCoupon(code: string, subtotal: number) {
  const clean = code.trim().toUpperCase();
  const { data, error } = await supabase.rpc("preview_coupon", {
    p_code: clean,
    p_subtotal: subtotal,
  });
  if (error) throw error;
  const result = (data ?? { ok: false }) as unknown as PreviewResult;
  if (!result.ok) {
    return {
      ok: false as const,
      message: checkoutErrorMessage({ message: result.code ?? "CUPOM_INVALIDO" }),
    };
  }
  return {
    ok: true as const,
    coupon: {
      code: result.code ?? clean,
      discount_type: result.discount_type ?? "fixed",
      discount_value: Number(result.discount_value ?? 0),
      min_order: Number(result.min_order ?? 0),
    } satisfies Coupon,
  };
}

export function couponDiscount(coupon: Coupon | null, subtotal: number, deliveryFee: number) {
  if (!coupon) return { discount: 0, freeShipping: false };
  if (coupon.discount_type === "free_shipping")
    return { discount: deliveryFee, freeShipping: true };
  if (coupon.discount_type === "percent")
    return { discount: (subtotal * Number(coupon.discount_value)) / 100, freeShipping: false };
  return { discount: Math.min(Number(coupon.discount_value), subtotal), freeShipping: false };
}
