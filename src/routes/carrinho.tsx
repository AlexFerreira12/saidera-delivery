import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Trash2, TicketPercent } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { ProductImage } from "@/components/ProductImage";
import { QtyStepper } from "@/components/QtyStepper";
import { useCart } from "@/hooks/useCart";
import { brl } from "@/lib/format";
import { unitPriceFor } from "@/lib/pricing";
import { validateCoupon, couponDiscount, type Coupon } from "@/lib/coupons";

export const Route = createFileRoute("/carrinho")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Carrinho — Bebidas Guariba" },
      { name: "description", content: "Revise seus itens, aplique cupom e finalize seu pedido." },
      { property: "og:title", content: "Carrinho — Bebidas Guariba" },
      { property: "og:description", content: "Revise seus itens e finalize o pedido." },
    ],
  }),
  component: CartPage,
});

const COUPON_KEY = "bg.coupon";

function CartPage() {
  const cart = useCart();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [checking, setChecking] = useState(false);

  const { discount } = couponDiscount(coupon, cart.subtotal, 0);
  const total = Math.max(cart.subtotal - discount, 0);

  const applyCoupon = async () => {
    if (!code.trim()) return;
    setChecking(true);
    try {
      const result = await validateCoupon(code, cart.subtotal);
      if (!result.ok) {
        toast.error(result.message);
        setCoupon(null);
      } else {
        setCoupon(result.coupon);
        localStorage.setItem(COUPON_KEY, result.coupon.code);
        toast.success("Cupom aplicado!");
      }
    } catch {
      toast.error("Não foi possível validar o cupom.");
    } finally {
      setChecking(false);
    }
  };

  if (cart.items.length === 0) {
    return (
      <AppShell>
        <PageHeader title="Carrinho" />
        <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
          <p className="font-display text-lg font-bold">Seu carrinho está vazio</p>
          <p className="text-sm text-muted-foreground">
            Adicione bebidas geladas e receba em minutos.
          </p>
          <Link
            to="/"
            className="mt-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
          >
            Ver produtos
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell hideCartBar>
      <PageHeader title="Carrinho" />
      <div className="space-y-3 p-4">
        {cart.items.map((item) => {
          const unit = unitPriceFor(item, item.quantity);
          return (
            <div key={item.id} className="surface-card flex gap-3 p-3">
              <ProductImage
                product={item}
                className="h-16 w-16 shrink-0 rounded-xl"
                imgClassName="p-1"
              />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {brl(unit)} · un {item.volume ? `· ${item.volume}` : ""}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <QtyStepper
                    size="sm"
                    quantity={item.quantity}
                    onIncrement={() => cart.increment(item.id)}
                    onDecrement={() => cart.decrement(item.id)}
                  />
                  <span className="font-display text-sm font-bold">
                    {brl(unit * item.quantity)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Remover item"
                onClick={() => cart.remove(item.id)}
                className="self-start text-muted-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}

        <div className="surface-card flex items-center gap-2 p-3">
          <TicketPercent className="h-4 w-4 text-primary" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Adicionar cupom"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={applyCoupon}
            disabled={checking}
            className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground"
          >
            Aplicar
          </button>
        </div>

        <div className="surface-card space-y-2 p-4 text-sm">
          <Row label="Subtotal" value={brl(cart.subtotal)} />
          {discount > 0 && (
            <Row
              label={`Desconto estimado (${coupon?.code})`}
              value={`- ${brl(discount)}`}
              highlight
            />
          )}
          <Row label="Taxa de entrega" value="calculada no checkout" muted />
          <div className="mt-2 flex justify-between border-t border-border pt-2 font-display text-base font-bold">
            <span>Total estimado</span>
            <span>{brl(total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Valores e cupom são confirmados no momento de finalizar o pedido.
          </p>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 safe-bottom border-t border-border bg-card px-4 pt-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/checkout" })}
          className="mx-auto block w-full max-w-2xl rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground"
        >
          CONTINUAR
        </button>
      </div>
    </AppShell>
  );
}

function Row({
  label,
  value,
  highlight,
  muted,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          highlight
            ? "font-semibold text-success"
            : muted
              ? "text-muted-foreground"
              : "font-semibold"
        }
      >
        {value}
      </span>
    </div>
  );
}
