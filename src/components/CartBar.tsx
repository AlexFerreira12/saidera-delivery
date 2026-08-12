import { Link } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { brl } from "@/lib/format";

export function CartBar({ offsetNav = true }: { offsetNav?: boolean }) {
  const { count, subtotal } = useCart();
  if (count === 0) return null;
  return (
    <div className={`fixed inset-x-0 z-40 px-3 ${offsetNav ? "bottom-16" : "bottom-3"}`}>
      <Link
        to="/carrinho"
        className="mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-float"
      >
        <span className="flex items-center gap-2 text-sm font-bold">
          <ShoppingBag className="h-5 w-5" />
          Ver carrinho
        </span>
        <span className="text-sm font-semibold">
          {count} {count === 1 ? "item" : "itens"} • {brl(subtotal)}
        </span>
      </Link>
    </div>
  );
}
