import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brl, timeBR } from "@/lib/format";
import { ORDER_FLOW, STATUS_LABEL, nextStatus } from "@/lib/orders";

export const Route = createFileRoute("/admin/")({
  component: AdminOrders,
});

type AdminOrder = {
  id: string;
  order_number: number;
  status: string;
  total: number;
  payment_method: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  address_snapshot: { street?: string; number?: string; neighborhood?: string } | null;
  order_items?: { id: string; product_name: string; quantity: number }[];
};

const FILTERS = ["ativos", ...ORDER_FLOW, "cancelado"];

function AdminOrders() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("ativos");

  const { data: orders } = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(id, product_name, quantity)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AdminOrder[];
    },
    refetchInterval: 20000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.rpc("set_order_status", { p_order_id: id, p_status: status });
    if (error) toast.error(checkoutErrorMessage(error));
    else {
      toast.success(`Pedido atualizado: ${STATUS_LABEL[status]}`);
      void qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    }
  };


  const list = (orders ?? []).filter((o) =>
    filter === "ativos" ? !["entregue", "cancelado"].includes(o.status) : o.status === filter,
  );
  const today = (orders ?? []).filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString());
  const revenue = today.filter((o) => o.status !== "cancelado").reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Pedidos hoje" value={String(today.length)} />
        <Stat label="Faturamento hoje" value={brl(revenue)} />
        <Stat label="Em andamento" value={String((orders ?? []).filter((o) => !["entregue", "cancelado"].includes(o.status)).length)} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {f === "ativos" ? "Ativos" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {list.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Nenhum pedido aqui.</p>}

      <div className="space-y-3">
        {list.map((o) => {
          const next = nextStatus(o.status);
          return (
            <div key={o.id} className="surface-card space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-sm font-bold">
                    #{o.order_number} · {o.customer_name ?? "Cliente"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {timeBR(o.created_at)} ·{" "}
                    {o.address_snapshot
                      ? `${o.address_snapshot.street}, ${o.address_snapshot.number} — ${o.address_snapshot.neighborhood}`
                      : "sem endereço"}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-bold">
                  {STATUS_LABEL[o.status]}
                </span>
              </div>
              <ul className="text-xs text-muted-foreground">
                {(o.order_items ?? []).map((i) => (
                  <li key={i.id}>
                    {i.quantity}x {i.product_name}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="font-display text-sm font-bold">{brl(o.total)}</span>
                <span className="text-xs text-muted-foreground">{o.payment_method}</span>
                <div className="ml-auto flex gap-2">
                  {o.status !== "cancelado" && o.status !== "entregue" && (
                    <button
                      type="button"
                      onClick={() => setStatus(o.id, "cancelado")}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-destructive"
                    >
                      Cancelar
                    </button>
                  )}
                  {next && (
                    <button
                      type="button"
                      onClick={() => setStatus(o.id, next)}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                    >
                      {STATUS_LABEL[next]}
                    </button>
                  )}
                  <Link
                    to="/pedido/$id"
                    params={{ id: o.id }}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold"
                  >
                    Detalhes
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
