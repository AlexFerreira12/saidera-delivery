import { Link } from "@tanstack/react-router";
import { Snowflake, Heart } from "lucide-react";
import { brl } from "@/lib/format";
import { basePrice, nextTierHint, type PriceTier } from "@/lib/pricing";
import { QtyStepper } from "@/components/QtyStepper";
import { useCart } from "@/hooks/useCart";
import { toCartItem, type Product } from "@/lib/catalog";
import { toast } from "sonner";

export function ProductImage({
  product,
  className = "",
}: {
  product: Product;
  className?: string;
}) {
  if (product.image_url) {
    return (
      <img
        src={product.image_url}
        alt={product.name}
        loading="lazy"
        className={`object-cover ${className}`}
      />
    );
  }
  return (
    <div className={`grid place-items-center bg-secondary ${className}`}>
      <span className="px-2 text-center font-display text-xs font-semibold text-muted-foreground">
        {product.brand ?? product.name.split(" ")[0]}
      </span>
    </div>
  );
}

export function ProductCard({
  product,
  isFavorite,
  onToggleFavorite,
}: {
  product: Product;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}) {
  const cart = useCart();
  const qty = cart.quantityOf(product.id);
  const price = basePrice({ price: Number(product.price), promo_price: product.promo_price });
  const hasPromo =
    product.promo_price != null && Number(product.promo_price) < Number(product.price);
  const tiers = (product.promotions ?? []) as PriceTier[];
  const hint = nextTierHint(
    { price: Number(product.price), promo_price: product.promo_price, tiers },
    qty,
  );
  const soldOut = product.stock <= 0;

  return (
    <div className="surface-card relative flex flex-col overflow-hidden">
      {onToggleFavorite && (
        <button
          type="button"
          aria-label="Favoritar"
          onClick={() => onToggleFavorite(product.id)}
          className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-card/90 shadow-card"
        >
          <Heart
            className={`h-4 w-4 ${isFavorite ? "fill-primary text-primary" : "text-muted-foreground"}`}
          />
        </button>
      )}
      <Link to="/produto/$slug" params={{ slug: product.slug ?? product.id }} className="block">
        <ProductImage product={product} className="h-32 w-full" />
        <div className="space-y-1 p-3 pb-1">
          <div className="flex flex-wrap items-center gap-1">
            {product.temperature === "gelado" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ice/15 px-2 py-0.5 text-[10px] font-semibold text-ice">
                <Snowflake className="h-3 w-3" /> Gelado
              </span>
            )}
            {hasPromo && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Oferta
              </span>
            )}
          </div>
          <h3 className="line-clamp-2 text-sm font-semibold leading-tight">{product.name}</h3>
          <p className="text-xs text-muted-foreground">{product.volume}</p>
        </div>
      </Link>

      <div className="mt-auto space-y-2 p-3 pt-1">
        <div className="flex items-baseline gap-2">
          <span className="font-sans text-lg font-bold tracking-tight text-primary">
            {brl(price)}
          </span>
          {hasPromo && (
            <span className="text-xs text-muted-foreground line-through">{brl(product.price)}</span>
          )}
        </div>
        {hint && (
          <p className="text-[11px] font-medium text-success">
            {hint.min_quantity}+ un por {brl(Number(hint.unit_price))} cada
          </p>
        )}
        {soldOut ? (
          <span className="block rounded-xl bg-muted py-2 text-center text-xs font-semibold text-muted-foreground">
            Esgotado
          </span>
        ) : qty > 0 ? (
          <div className="flex justify-end">
            <QtyStepper
              quantity={qty}
              size="sm"
              onIncrement={() => cart.increment(product.id)}
              onDecrement={() => cart.decrement(product.id)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              cart.add(toCartItem(product));
              toast.success("Adicionado ao carrinho");
            }}
            className="w-full rounded-xl bg-primary py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            ADICIONAR
          </button>
        )}
      </div>
    </div>
  );
}
