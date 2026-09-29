import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { brl } from "@/lib/format";
import { fetchDashboardMetrics, fetchLowStock } from "@/lib/admin";
import { AdminPage, Card, StateBlock } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

const SHORTCUTS: { to: string; label: string }[] = [
  { to: "/admin/pdv", label: "Abrir PDV" },
  { to: "/admin/delivery", label: "Central Delivery" },
  { to: "/admin/pedidos", label: "Pedidos" },
  { to: "/admin/produtos", label: "Produtos" },
  { to: "/admin/categorias", label: "Categorias" },
  { to: "/admin/promocoes", label: "Promoções" },
  { to: "/admin/cupons", label: "Cupons" },
  { to: "/admin/banners", label: "Banners" },
  { to: "/admin/entrega", label: "Entrega" },
  { to: "/admin/clientes", label: "Clientes" },
  { to: "/admin/entregadores", label: "Entregadores" },
  { to: "/admin/configuracoes", label: "Configurações" },
];

function AdminDashboard() {
  const {
    data: m,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "metrics"],
    queryFn: fetchDashboardMetrics,
    refetchInterval: 30000,
  });
  const { data: lowStock } = useQuery({ queryKey: ["admin", "low-stock"], queryFn: fetchLowStock });

  return (
    <AdminPage>
      <StateBlock loading={isLoading && !m} error={error} emptyText="" />

      {m && (
        <>
          <Card className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">Status da loja</p>
              <p className="font-display text-lg font-extrabold">
                {m.store_open ? "Aberta" : "Fechada"}
              </p>
            </div>
            <Link
              to="/admin/configuracoes"
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
            >
              {m.store_open ? "Fechar loja" : "Abrir loja"}
            </Link>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Pedidos hoje" value={String(m.orders_today)} />
            <Stat label="Faturamento hoje" value={brl(Number(m.revenue_today))} />
            <Stat label="Entregues hoje" value={String(m.delivered_today)} />
            <Stat label="Ticket médio" value={brl(Number(m.avg_ticket_today))} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Novos" value={String(m.open_new)} />
            <Stat label="Em preparo" value={String(m.open_preparing)} />
            <Stat label="Prontos" value={String(m.open_ready)} />
            <Stat label="Em rota" value={String(m.open_route)} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Estoque baixo" value={String(m.low_stock)} />
            <Stat label="Sem estoque" value={String(m.out_of_stock)} />
            <Stat label="Clientes" value={String(m.customers)} />
            <Stat label="Entregadores ativos" value={String(m.active_drivers)} />
          </div>

          <Card>
            <p className="font-display text-sm font-bold">Produtos com estoque baixo</p>
            {(lowStock ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum produto abaixo do mínimo.</p>
            )}
            {(lowStock ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{p.name}</span>
                <span className="text-xs font-bold text-destructive">
                  {p.stock} / mín. {p.min_stock}
                </span>
              </div>
            ))}
            <Link to="/admin/produtos" className="text-xs font-bold text-primary">
              Ajustar estoque
            </Link>
          </Card>

          <div className="flex flex-wrap gap-2">
            {SHORTCUTS.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </AdminPage>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-extrabold">{value}</p>
    </div>
  );
}
