import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bike, Copy, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { brl, dateTimeBR, timeBR } from "@/lib/format";
import {
  acceptDelivery,
  addressText,
  completeDelivery,
  deliveryErrorMessage,
  fetchAvailableOrders,
  fetchDriverHistory,
  fetchMyDeliveries,
  mapsUrl,
  type AvailableOrder,
  type DriverOrder,
} from "@/lib/delivery";

export const Route = createFileRoute("/entregador")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Área do entregador — Bebidas Guariba" },
      {
        name: "description",
        content: "Entregas disponíveis e rotas para entregadores em Guariba/SP.",
      },
      { property: "og:title", content: "Área do entregador — Bebidas Guariba" },
      {
        property: "og:description",
        content: "Aceite entregas e confirme com o código do cliente.",
      },
    ],
  }),
  component: DriverPage,
});

type Tab = "minhas" | "disponiveis" | "historico";

function DriverPage() {
  const { session, roles, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const allowed = roles.includes("driver") || roles.includes("admin");
  const [tab, setTab] = useState<Tab>("minhas");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) void navigate({ to: "/auth" });
    else if (!allowed) void navigate({ to: "/" });
  }, [loading, session, allowed, navigate]);

  const ready = !loading && !!session && allowed;

  const { data: driver } = useQuery({
    queryKey: ["driver", "me", session?.user.id],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_drivers")
        .select("id, name, is_active")
        .eq("user_id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string; is_active: boolean } | null;
    },
  });

  const mine = useQuery({
    queryKey: ["driver", "mine"],
    enabled: ready && !!driver?.is_active,
    refetchInterval: 20000,
    queryFn: fetchMyDeliveries,
  });

  const available = useQuery({
    queryKey: ["driver", "available"],
    enabled: ready,
    refetchInterval: 15000,
    queryFn: fetchAvailableOrders,
  });

  const history = useQuery({
    queryKey: ["driver", "history"],
    enabled: ready && tab === "historico",
    queryFn: () => fetchDriverHistory(30, 0),
  });

  useEffect(() => {
    if (!ready) return;
    const channel = supabase
      .channel("driver-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void qc.invalidateQueries({ queryKey: ["driver"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ready, qc]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["driver"] });

  const accept = async (id: string) => {
    if (busy) return;
    if (!driver?.is_active) {
      toast.error("Seu cadastro de entregador não está ativo. Fale com o administrador.");
      return;
    }
    setBusy(id);
    try {
      await acceptDelivery(id);
      toast.success("Entrega aceita! Boa rota.");
      setTab("minhas");
      await refresh();
    } catch (e) {
      toast.error(deliveryErrorMessage(e));
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const complete = async (id: string, pin: string) => {
    if (busy) return;
    setBusy(id);
    try {
      await completeDelivery(id, pin);
      toast.success("Entrega confirmada!");
      await refresh();
    } catch (e) {
      toast.error(deliveryErrorMessage(e));
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  if (!ready) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>;
  }

  const mineList = mine.data ?? [];
  const availableList = available.data ?? [];

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <p className="flex items-center gap-2 font-display text-lg font-extrabold">
          <Bike className="h-5 w-5 text-primary" /> Entregas
        </p>
        <p className="text-xs text-muted-foreground">{driver?.name ?? "Entregador"} · Guariba/SP</p>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {(
            [
              ["minhas", `Minhas (${mineList.length})`],
              ["disponiveis", `Disponíveis (${availableList.length})`],
              ["historico", "Histórico"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                tab === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4">
        {driver && !driver.is_active && (
          <p className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
            Seu cadastro está inativo. Fale com o administrador para voltar a receber entregas.
          </p>
        )}

        {tab === "minhas" &&
          (mine.isLoading ? (
            <Empty text="Carregando..." />
          ) : mine.error ? (
            <ErrorBlock onRetry={() => void mine.refetch()} />
          ) : mineList.length === 0 ? (
            <Empty text="Nenhuma entrega em andamento." />
          ) : (
            mineList.map((o) => (
              <AssignedCard
                key={o.id}
                order={o}
                busy={busy === o.id}
                onComplete={(pin) => void complete(o.id, pin)}
              />
            ))
          ))}

        {tab === "disponiveis" &&
          (available.isLoading ? (
            <Empty text="Carregando..." />
          ) : available.error ? (
            <ErrorBlock onRetry={() => void available.refetch()} />
          ) : availableList.length === 0 ? (
            <Empty text="Nenhuma entrega disponível agora." />
          ) : (
            availableList.map((o) => (
              <QueueCard
                key={o.id}
                order={o}
                busy={busy === o.id}
                onAccept={() => void accept(o.id)}
              />
            ))
          ))}

        {tab === "historico" &&
          (history.isLoading ? (
            <Empty text="Carregando..." />
          ) : history.error ? (
            <ErrorBlock onRetry={() => void history.refetch()} />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Hoje" value={history.data?.today ?? 0} />
                <Metric label="7 dias" value={history.data?.week ?? 0} />
                <Metric label="Total" value={history.data?.total ?? 0} />
              </div>
              {(history.data?.rows ?? []).length === 0 && (
                <Empty text="Nenhuma entrega concluída ainda." />
              )}
              {(history.data?.rows ?? []).map((r) => (
                <div key={r.id} className="surface-card flex justify-between gap-3 p-4 text-sm">
                  <div>
                    <p className="font-display font-bold">#{r.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.neighborhood ?? "—"} · {dateTimeBR(r.delivered_at)}
                    </p>
                  </div>
                  <span className="font-display font-bold">{brl(r.total)}</span>
                </div>
              ))}
            </div>
          ))}
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-card p-3 text-center">
      <p className="font-display text-xl font-extrabold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function ErrorBlock({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="surface-card space-y-2 p-4 text-center text-sm">
      <p className="text-muted-foreground">Não foi possível carregar. Verifique sua conexão.</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
      >
        Tentar de novo
      </button>
    </div>
  );
}

function QueueCard({
  order,
  busy,
  onAccept,
}: {
  order: AvailableOrder;
  busy: boolean;
  onAccept: () => void;
}) {
  return (
    <div className="surface-card space-y-2 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-sm font-bold">#{order.order_number}</p>
          <p className="text-xs text-muted-foreground">
            {timeBR(order.created_at)} · {order.items_count} item(ns)
          </p>
        </div>
        <span className="font-display text-sm font-bold">{brl(order.total)}</span>
      </div>
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        {order.street || "Endereço"} — {order.neighborhood}
      </p>
      <p className="text-xs text-muted-foreground">Pagamento: {order.payment_method}</p>
      <button
        type="button"
        disabled={busy}
        onClick={onAccept}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
      >
        {busy ? "ACEITANDO..." : "ACEITAR ENTREGA"}
      </button>
    </div>
  );
}

function AssignedCard({
  order,
  busy,
  onComplete,
}: {
  order: DriverOrder;
  busy: boolean;
  onComplete: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  const full = addressText(order.address);

  return (
    <div className="surface-card space-y-3 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-sm font-bold">
            #{order.order_number} · {order.customer_name ?? "Cliente"}
          </p>
          <p className="text-xs text-muted-foreground">Aceita às {timeBR(order.accepted_at)}</p>
        </div>
        <span className="font-display text-sm font-bold">{brl(order.total)}</span>
      </div>

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          {full}
          {order.address.reference ? ` (${order.address.reference})` : ""}
        </span>
      </p>

      <ul className="text-xs text-muted-foreground">
        {order.items.map((i) => (
          <li key={i.id}>
            {i.quantity}x {i.name}
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">Pagamento: {order.payment_method}</p>
      {order.notes && <p className="text-xs text-muted-foreground">Obs.: {order.notes}</p>}

      <div className="flex flex-wrap gap-2">
        {order.customer_phone && (
          <a
            href={`tel:${order.customer_phone}`}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold"
          >
            <Phone className="h-3.5 w-3.5" /> Ligar
          </a>
        )}
        <a
          href={mapsUrl(order.address)}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-border px-3 py-2 text-xs font-bold"
        >
          Rota
        </a>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(full)
              .then(() => toast.success("Endereço copiado."))
              .catch(() => toast.error("Não foi possível copiar."));
          }}
          className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold"
        >
          <Copy className="h-3.5 w-3.5" /> Copiar endereço
        </button>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          Peça ao cliente o código de 4 dígitos para confirmar a entrega.
        </p>
        <div className="flex gap-2">
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="0000"
            className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-center font-display text-lg font-bold tracking-widest"
          />
          <button
            type="button"
            disabled={busy || pin.length !== 4}
            onClick={() => onComplete(pin)}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "CONFIRMANDO..." : "CONFIRMAR ENTREGA"}
          </button>
        </div>
        {order.pin_attempts > 0 && (
          <p className="text-[11px] text-destructive">
            {order.pin_attempts >= 5
              ? "Código bloqueado. Fale com o administrador."
              : `Tentativas incorretas: ${order.pin_attempts} de 5.`}
          </p>
        )}
      </div>
    </div>
  );
}
