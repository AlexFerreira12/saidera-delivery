import { Link } from "@tanstack/react-router";
import { Home, LayoutGrid, ReceiptText, Heart, User } from "lucide-react";

const items = [
  { to: "/", label: "Início", icon: Home },
  { to: "/categorias", label: "Categorias", icon: LayoutGrid },
  { to: "/pedidos", label: "Pedidos", icon: ReceiptText },
  { to: "/favoritos", label: "Favoritos", icon: Heart },
  { to: "/conta", label: "Conta", icon: User },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 safe-bottom border-t border-border bg-card/95 backdrop-blur">
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              activeOptions={{ exact: to === "/" }}
              activeProps={{ className: "text-primary" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold"
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
