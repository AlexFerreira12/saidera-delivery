import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Painel administrativo — Bebidas Guariba" },
      {
        name: "description",
        content: "Gestão de pedidos, produtos e estoque da distribuidora de Guariba/SP.",
      },
      { property: "og:title", content: "Painel administrativo — Bebidas Guariba" },
      { property: "og:description", content: "Gestão de pedidos, produtos e estoque." },
    ],
  }),
  component: AdminLayout,
});

const TABS: { to: string; label: string; exact?: boolean }[] = [
  { to: "/admin", label: "Visão geral", exact: true },
  { to: "/admin/pedidos", label: "Pedidos" },
  { to: "/admin/pagamentos", label: "Pagamentos" },

  { to: "/admin/produtos", label: "Produtos" },
  { to: "/admin/estoque", label: "Estoque" },
  { to: "/admin/categorias", label: "Categorias" },
  { to: "/admin/promocoes", label: "Promoções" },
  { to: "/admin/cupons", label: "Cupons" },
  { to: "/admin/banners", label: "Banners" },
  { to: "/admin/entrega", label: "Entrega" },
  { to: "/admin/enderecos", label: "Endereços" },
  { to: "/admin/area-entrega", label: "Área de entrega" },
  { to: "/admin/clientes", label: "Clientes" },
  { to: "/admin/entregadores", label: "Entregadores" },
  { to: "/admin/configuracoes", label: "Configurações" },
];

function AdminLayout() {
  const { session, roles, loading } = useAuth();
  const navigate = useNavigate();
  const isAdmin = roles.includes("admin");

  useEffect(() => {
    if (loading) return;
    if (!session) void navigate({ to: "/auth" });
    else if (!isAdmin) void navigate({ to: "/" });
  }, [loading, session, isAdmin, navigate]);

  if (loading || !session || !isAdmin) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">Carregando painel...</div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3">
          <p className="font-display text-lg font-extrabold">Administração</p>
          <nav className="mt-2 flex gap-2 overflow-x-auto text-sm">
            {TABS.map((t) => (
              <Tab key={t.to} to={t.to} label={t.label} exact={t.exact === true} />
            ))}
            <Link
              to="/"
              className="whitespace-nowrap rounded-full px-3 py-1.5 font-semibold text-muted-foreground"
            >
              Ver loja
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl">
        <Outlet />
      </main>
    </div>
  );
}

function Tab({ to, label, exact }: { to: string; label: string; exact?: boolean }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: exact === true }}
      activeProps={{ className: "bg-primary text-primary-foreground" }}
      className="whitespace-nowrap rounded-full bg-secondary px-3 py-1.5 font-semibold text-secondary-foreground"
    >
      {label}
    </Link>
  );
}
