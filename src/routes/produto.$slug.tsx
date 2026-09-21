import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Snowflake } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { ProductImage } from "@/components/ProductCard";
import { QtyStepper } from "@/components/QtyStepper";
import { fetchProductBySlug, fetchProducts, toCartItem, type Product } from "@/lib/catalog";
import { brl } from "@/lib/format";
import { basePrice, unitPriceFor, type PriceTier } from "@/lib/pricing";
import { useCart } from "@/hooks/useCart";
import { ProductGrid } from "@/routes/index";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/produto/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug.replace(/-/g, " ")} — Bebidas Guariba` },
      {
        name: "description",
        content: "Detalhes do produto, preço e entrega rápida em Guariba/SP.",
      },
      { property: "og:title", content: "Produto — Bebidas Guariba" },
      { property: "og:description", content: "Bebidas geladas com entrega rápida em Guariba/SP." },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useParams();
  const cart = useCart();
  const [quantity, setQuantity] = useState(1);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", slug],
    queryFn: () => fetchProductBySlug(slug),
  });
  const { data: related } = useQuery({
    queryKey: ["related", product?.category_id],
    enabled: !!product?.categories?.slug,
    queryFn: () => fetchProducts({ categorySlug: product!.categories!.slug }),
  });

  if (isLoading) {
    return (
      <AppShell hideNav>
        <PageHeader title="Produto" />
        <div className="space-y-3 p-4">
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-20 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!product) {
    return (
      <AppShell hideNav>
        <PageHeader title="Produto" />
        <p className="p-8 text-center text-sm text-muted-foreground">Produto não encontrado.</p>
      </AppShell>
    );
  }

  const tiers = (product.promotions ?? []) as PriceTier[];
  const priced = { price: Number(product.price), promo_price: product.promo_price, tiers };
  const unit = unitPriceFor(priced, quantity);
  const hasPromo =
    product.promo_price != null && Number(product.promo_price) < Number(product.price);

  return (
    <AppShell hideNav hideCartBar>
      <PageHeader title={product.name} />
      <ProductImage product={product} className="h-64 w-full" />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {product.temperature === "gelado" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-ice/15 px-2.5 py-1 text-xs font-semibold text-ice">
              <Snowflake className="h-3.5 w-3.5" /> Gelado
            </span>
          )}
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
            {product.volume ?? product.unit}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              product.stock > 0 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            {product.stock > 0 ? `${product.stock} disponíveis` : "Esgotado"}
          </span>
        </div>

        <div>
          <h1 className="font-display text-2xl font-extrabold">{product.name}</h1>
          {product.brand && <p className="text-sm text-muted-foreground">{product.brand}</p>}
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-extrabold text-primary">{brl(unit)}</span>
          {hasPromo && (
            <span className="text-sm text-muted-foreground line-through">{brl(product.price)}</span>
          )}
          <span className="text-xs text-muted-foreground">/un</span>
        </div>

        {product.description && (
          <p className="text-sm text-muted-foreground">{product.description}</p>
        )}

        {tiers.length > 0 && (
          <div className="surface-card space-y-2 p-4">
            <p className="font-display text-sm font-bold">Quanto mais, mais barato</p>
            <ul className="space-y-1 text-sm">
              <li className="flex justify-between">
                <span>1 unidade</span>
                <span className="font-semibold">{brl(basePrice(priced))}</span>
              </li>
              {tiers
                .slice()
                .sort((a, b) => a.min_quantity - b.min_quantity)
                .map((t) => (
                  <li key={t.min_quantity} className="flex justify-between text-success">
                    <span>{t.min_quantity} unidades ou mais</span>
                    <span className="font-semibold">{brl(Number(t.unit_price))} cada</span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {related && related.length > 1 && (
          <div>
            <h2 className="mb-3 font-display text-base font-bold">Você também pode gostar</h2>
            <ProductGrid
              products={(related as Product[]).filter((p) => p.id !== product.id).slice(0, 4)}
            />
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 safe-bottom border-t border-border bg-card px-4 pt-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <QtyStepper
            quantity={quantity}
            onIncrement={() => setQuantity((q) => Math.min(q + 1, Math.max(product.stock, 1)))}
            onDecrement={() => setQuantity((q) => Math.max(1, q - 1))}
          />
          <button
            type="button"
            disabled={product.stock <= 0}
            onClick={() => {
              cart.add(toCartItem(product), quantity);
              toast.success(`${quantity}x ${product.name} no carrinho`);
            }}
            className="flex-1 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            ADICIONAR • {brl(unit * quantity)}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
