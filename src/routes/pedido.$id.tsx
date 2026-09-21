import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateTimeBR } from "@/lib/format";
import { ORDER_FLOW, PAYMENT_LABEL, STATUS_LABEL, statusIndex } from "@/lib/orders";
import { fetchOrderPin } from "@/lib/delivery";

export const Route = createFileRoute("/pedido/$id")({
  head: () => ({
    meta: [
      { title: "Acompanhar pedido — Bebidas Guariba" },
      {
        name: "description",
        content: "Acompanhe em tempo real o status da sua entrega em Guariba/SP.",
      },
      { property: "og:title", content: "Acompanhar pedido — Bebidas Guariba" },
      { property: "og:description", content: "Status em tempo real do seu pedido." },
    ],
  }),
  component: OrderPage,
});

export type OrderRow = {
  id: string;
  order_number: number;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  total: number;
  notes: string | null;
  eta_minutes: number | null;
  created_at: string;
  address_snapshot: {
    street?: string;
    number?: string;
    neighborhood?: string;
    complement?: string;
  } | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivered_at?: string | null;
  order_items?: {
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    image_url: string | null;
  }[];
};

export async function fetchOrder(id: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as OrderRow | null;
}

function OrderPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: order, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder(id),
  });
  const { data: pin } = useQuery({
    queryKey: ["order", id, "pin"],
    queryFn: () => fetchOrderPin(id),
    enabled: order?.status === "saiu_para_entrega",
  });

  useEffect(() => {
    const channel = supabase
      .channel(`order-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["order", id] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, qc]);

  if (isLoading) {
    return (
      <AppShell hideCartBar>
        <PageHeader title="Pedido" />
        <p className="p-8 text-center text-sm text-muted-foreground">Carregando...</p>
      </AppShell>
    );
  }

  if (!order) {
    return (
      <AppShell hideCartBar>
        <PageHeader title="Pedido" />
        <p className="p-8 text-center text-sm text-muted-foreground">Pedido não encontrado.</p>
      </AppShell>
    );
  }

  const current = statusIndex(order.status);
  const canceled = order.status === "cancelado";
  const addr = order.address_snapshot;

  return (
    <AppShell hideCartBar>
      <PageHeader title={`Pedido #${order.order_number}`} />
      <div className="space-y-4 p-4">
        <section className="surface-card p-4">
          <p className="font-display text-lg font-extrabold">
            {canceled ? "Pedido cancelado" : STATUS_LABEL[order.status]}
          </p>
          <p className="text-sm text-muted-foreground">
            {canceled
              ? "Este pedido foi cancelado."
              : order.status === "entregue"
                ? "Obrigado por comprar com a gente!"
                : `Previsão de entrega em cerca de ${order.eta_minutes ?? 40} minutos.`}
          </p>

          <ol className="mt-4 space-y-3">
            {canceled ? (
              <li className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="h-4 w-4" /> Cancelado
              </li>
            ) : (
              ORDER_FLOW.map((s, i) => {
                const done = i <= current;
                return (
                  <li
                    key={s}
                    className={`flex items-center gap-2 text-sm ${done ? "" : "text-muted-foreground"}`}
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Circle className="h-4 w-4 opacity-50" />
                    )}
                    {STATUS_LABEL[s]}
                  </li>
                );
              })
            )}
          </ol>
        </section>

        {order.payment_method === "pix" && order.payment_status !== "pago" && !canceled && (
          <section className="surface-card space-y-2 p-4 text-sm">
            <p className="font-display text-sm font-bold">Pagamento PIX pendente</p>
            <p className="text-xs text-muted-foreground">
              Seu pedido entra em separação assim que o pagamento for confirmado.
            </p>
            <Link
              to="/pagamento/$id"
              params={{ id: order.id }}
              className="block rounded-2xl bg-primary py-3 text-center text-sm font-bold text-primary-foreground"
            >
              Pagar agora
            </Link>
          </section>
        )}

        {order.payment_method === "pix" && order.payment_status === "pago" && (
          <section className="surface-card p-4 text-sm text-success">
            Pagamento PIX confirmado.
          </section>
        )}

        {order.status === "saiu_para_entrega" && pin && (
          <section className="surface-card p-4 text-center">
            <h2 className="font-display text-sm font-bold">Código de entrega</h2>
            <p className="my-2 font-display text-4xl font-extrabold tracking-[0.4em]">{pin}</p>
            <p className="text-xs text-muted-foreground">
              Informe este código ao entregador apenas ao receber o pedido.
            </p>
          </section>
        )}

        {order.status === "entregue" && order.delivered_at && (
          <section className="surface-card p-4 text-sm text-muted-foreground">
            Entregue em {dateTimeBR(order.delivered_at)}.
          </section>
        )}

        <section className="surface-card p-4">
          <h2 className="mb-2 font-display text-sm font-bold">Itens</h2>
          <ul className="space-y-2 text-sm">
            {(order.order_items ?? []).map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {item.quantity}x {item.product_name}
                </span>
                <span className="font-semibold">{brl(item.total_price)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            <Row label="Subtotal" value={brl(order.subtotal)} />
            <Row label="Entrega" value={brl(order.delivery_fee)} />
            {Number(order.discount) > 0 && (
              <Row label="Desconto" value={`- ${brl(order.discount)}`} />
            )}
            <div className="flex justify-between font-display text-base font-bold">
              <span>Total</span>
              <span>{brl(order.total)}</span>
            </div>
          </div>
        </section>

        <section className="surface-card space-y-1 p-4 text-sm">
          <h2 className="mb-1 font-display text-sm font-bold">Detalhes</h2>
          {addr && (
            <p className="text-muted-foreground">
              {addr.street}, {addr.number}
              {addr.complement ? ` - ${addr.complement}` : ""} — {addr.neighborhood}
            </p>
          )}
          <p className="text-muted-foreground">
            Pagamento: {PAYMENT_LABEL[order.payment_method] ?? order.payment_method}
          </p>
          <p className="text-muted-foreground">Feito em {dateTimeBR(order.created_at)}</p>
          {order.notes && <p className="text-muted-foreground">Obs.: {order.notes}</p>}
        </section>

        <Link
          to="/pedidos"
          className="block rounded-2xl border border-border bg-card py-3 text-center text-sm font-bold"
        >
          Ver meus pedidos
        </Link>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
