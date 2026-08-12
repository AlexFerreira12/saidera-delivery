import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Bike, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { brl, timeBR } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";

export const Route = createFileRoute("/entregador")({
  head: () => ({
    meta: [
      { title: "Área do entregador — Bebidas Guariba" },
      { name: "description", content: "Entregas disponíveis e rotas para entregadores em Guariba/SP." },
      { property: "og:title", content: "Área do entregador — Bebidas Guariba" },
      { property: "og:description", content: "Aceite entregas e atualize o status em tempo real." },
    ],
  }),
  component: DriverPage,
});

type DriverOrder = {
  id: string;
  order_number: number;
  status: string;
  total: number;
  payment_method: string;
  created_at: string;
  driver_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address_snapshot: { street?: string; number?: string; neighborhood?: string; reference?: string } | null;
};

function DriverPage() {
  const { session, roles, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const allowed = roles.includes("driver") || roles.includes("admin");

  useEffect(() => {
    if (loading) return;
    if (!session) void navigate({ to: "/auth" });
    else if (!allowed) void navigate({ to: "/" });
  }, [loading, session, allowed, navigate]);

  const { data: driver } = useQuery({
    queryKey: ["driver", session?.user.id],
    enabled: !!session && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_drivers")
        .select("*")
        .eq("user_id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string } | null;
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["driver", "orders"],
    enabled: !!session && allowed,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("status", ["pronto", "saiu_para_entrega"])
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as DriverOrder[];
    },
  });

  const accept = async (id: string) => {
    if (!driver) {
      toast.error("Seu cadastro de entregador ainda não foi criado pelo administrador.");
      return;
    }
    const { error } = await supabase
      .from("orders")
      .update({ driver_id: driver.id, status: "saiu_para_entrega" })
      .eq("id", id);
    if (error) toast.error("Não foi possível aceitar a entrega.");
    else {
      toast.success("Entrega aceita! Boa rota.");
      void qc.invalidateQueries({ queryKey: ["driver", "orders"] });
    }
  };

  const finish = async (id: string) => {
    const { error } = await supabase.from("orders").update({ status: "entregue" }).eq("id", id);
    if (error) toast.error("Não foi possível concluir.");
    else {
      toast.success("Entrega concluída!");
      void qc.invalidateQueries({ queryKey: ["driver", "orders"] });
    }
  };

  if (loading || !allowed) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>;
  }

  const mine = (orders ?? []).filter((o) => o.driver_id && o.driver_id === driver?.id);
  const available = (orders ?? []).filter((o) => !o.driver_id && o.status === "pronto");

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <p className="flex items-center gap-2 font-display text-lg font-extrabold">
          <Bike className="h-5 w-5 text-primary" /> Entregas
        </p>
        <p className="text-xs text-muted-foreground">{driver?.name ?? "Entregador"} · Guariba/SP</p>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 p-4">
        <Section title={`Minhas entregas (${mine.length})`}>
          {mine.length === 0 && <Empty text="Nenhuma entrega em andamento." />}
          {mine.map((o) => (
            <OrderCard key={o.id} order={o} action={{ label: "CONCLUIR ENTREGA", run: () => finish(o.id) }} />
          ))}
        </Section>

        <Section title={`Disponíveis (${available.length})`}>
          {available.length === 0 && <Empty text="Nenhuma entrega disponível agora." />}
          {available.map((o) => (
            <OrderCard key={o.id} order={o} action={{ label: "ACEITAR ENTREGA", run: () => accept(o.id) }} />
          ))}
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function OrderCard({ order, action }: { order: DriverOrder; action: { label: string; run: () => void } }) {
  const a = order.address_snapshot;
  const maps = a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${a.street}, ${a.number}, ${a.neighborhood}, Guariba SP`)}` : null;
  return (
    <div className="surface-card space-y-2 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-sm font-bold">
            #{order.order_number} · {order.customer_name ?? "Cliente"}
          </p>
          <p className="text-xs text-muted-foreground">
            {timeBR(order.created_at)} · {STATUS_LABEL[order.status]}
          </p>
        </div>
        <span className="font-display text-sm font-bold">{brl(order.total)}</span>
      </div>
      {a && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          {a.street}, {a.number} — {a.neighborhood}
          {a.reference ? ` (${a.reference})` : ""}
        </p>
      )}
      <p className="text-xs text-muted-foreground">Pagamento: {order.payment_method}</p>
      <div className="flex gap-2 pt-1">
        {order.customer_phone && (
          <a
            href={`tel:${order.customer_phone}`}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold"
          >
            <Phone className="h-3.5 w-3.5" /> Ligar
          </a>
        )}
        {maps && (
          <a
            href={maps}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-border px-3 py-2 text-xs font-bold"
          >
            Rota
          </a>
        )}
        <button
          type="button"
          onClick={action.run}
          className="ml-auto rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
        >
          {action.label}
        </button>
      </div>
    </div>
  );
}
