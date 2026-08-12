export type PriceTier = { min_quantity: number; unit_price: number | null; label?: string | null };

export type PricedProduct = {
  price: number;
  promo_price?: number | null;
  tiers?: PriceTier[] | null;
};

/** Base unit price (promo price when available). */
export function basePrice(p: PricedProduct) {
  return p.promo_price != null ? Number(p.promo_price) : Number(p.price);
}

/** Unit price considering quantity tiers (compre mais, pague menos). */
export function unitPriceFor(p: PricedProduct, quantity: number) {
  const tiers = (p.tiers ?? [])
    .filter((t) => t.unit_price != null && quantity >= t.min_quantity)
    .sort((a, b) => b.min_quantity - a.min_quantity);
  const tier = tiers[0];
  const base = basePrice(p);
  if (tier?.unit_price != null) return Math.min(Number(tier.unit_price), base);
  return base;
}

export function lineTotal(p: PricedProduct, quantity: number) {
  return unitPriceFor(p, quantity) * quantity;
}

export function nextTierHint(p: PricedProduct, quantity: number) {
  const next = (p.tiers ?? [])
    .filter((t) => t.unit_price != null && t.min_quantity > quantity)
    .sort((a, b) => a.min_quantity - b.min_quantity)[0];
  return next ?? null;
}
