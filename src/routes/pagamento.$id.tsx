import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Copy, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { paymentErrorMessage, timeLeft } from "@/lib/payments";
import { createPixCharge, syncPixPayment } from "@/lib/payments.functions";

export const Route = createFileRoute("/pagamento/$id")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Pagamento PIX — Bebidas Guariba" },
      {
        name: "description",
        content: "Pague seu pedido por PIX e acompanhe a confirmação em tempo real.",
      },
      { property: "og:title", content: "Pagamento PIX — Bebidas Guariba" },
      { property: "og:description", content: "QR Code e código copia-e-cola do seu pedido." },
    ],
  }),
  component: PaymentPage,
});

function PaymentPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createCharge = useServerFn(createPixCharge);
  const syncCharge = useServerFn(syncPixPayment);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const charge = useQuery({
    queryKey: ["pix", id],
    queryFn: () => createCharge({ data: { orderId: id } }),
    retry: false,
  });

  const order = useQuery({
    queryKey: ["order", id, "payment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, payment_status, total")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 8000,
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`pay-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["order", id, "payment"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, qc]);

  const paid = order.data?.payment_status === "pago";
  const closed = order.data?.status === "cancelado";

  useEffect(() => {
    if (paid) {
      toast.success("Pagamento confirmado!");
      void navigate({ to: "/pedido/$id", params: { id } });
    }
  }, [paid, id, navigate]);

  const remaining = useMemo(
    () => timeLeft(charge.data?.expires_at ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [charge.data?.expires_at, now],
  );
  const expired = remaining === "expirado";

  const check = async () => {
    setBusy(true);
    try {
      const res = await syncCharge({ data: { orderId: id } });
      await qc.invalidateQueries({ queryKey: ["order", id, "payment"] });
      if (res.status !== "pago") toast.info("Ainda não identificamos o pagamento.");
    } catch (err) {
      toast.error(paymentErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const code = charge.data?.copy_paste;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    toast.success("Código copiado!");
  };

  return (
    <AppShell hideNav hideCartBar>
      <PageHeader title="Pagamento PIX" />
      <div className="space-y-4 p-4">
        {charge.isLoading && (
          <p className="p-8 text-center text-sm text-muted-foreground">Gerando cobrança...</p>
        )}

        {charge.isError && (
          <section className="surface-card space-y-3 p-4 text-sm">
            <p className="font-semibold text-destructive">{paymentErrorMessage(charge.error)}</p>
            <button
              type="button"
              onClick={() => void charge.refetch()}
              className="rounded-xl border border-border px-3 py-2 text-xs font-bold"
            >
              Tentar novamente
            </button>
            <Link
              to="/pedido/$id"
              params={{ id }}
              className="block text-xs font-semibold text-primary"
            >
              Ver o pedido
            </Link>
          </section>
        )}

        {charge.data && !closed && (
          <section className="surface-card space-y-4 p-4 text-center">
            <div>
              <p className="font-display text-sm font-bold">Pedido #{charge.data.order_number}</p>
              <p className="font-display text-2xl font-extrabold">
                {brl(Number(charge.data.amount))}
              </p>
              {remaining && !expired && (
                <p className="text-xs text-muted-foreground">Expira em {remaining}</p>
              )}
              {expired && (
                <p className="text-xs font-semibold text-destructive">Cobrança expirada</p>
              )}
            </div>

            {charge.data.qr_code && !expired && (
              <img
                src={charge.data.qr_code}
                alt="QR Code do PIX"
                className="mx-auto h-56 w-56 rounded-xl bg-white p-2"
              />
            )}

            {charge.data.copy_paste && !expired && (
              <>
                <p className="break-all rounded-xl border border-border bg-muted/40 p-3 text-[11px]">
                  {charge.data.copy_paste}
                </p>
                <button
                  type="button"
                  onClick={copy}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground"
                >
                  <Copy className="h-4 w-4" /> Copiar código PIX
                </button>
              </>
            )}

            <button
              type="button"
              onClick={check}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border py-3 text-sm font-bold disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" /> {busy ? "Verificando..." : "Já paguei"}
            </button>

            {expired && (
              <button
                type="button"
                onClick={() => void charge.refetch()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border py-3 text-sm font-bold"
              >
                <QrCode className="h-4 w-4" /> Gerar nova cobrança
              </button>
            )}

            <p className="text-xs text-muted-foreground">
              A confirmação é automática assim que o banco compensar o PIX. Seu pedido só entra em
              separação após o pagamento.
            </p>
          </section>
        )}

        {closed && (
          <section className="surface-card p-4 text-sm">
            <p className="font-semibold">Este pedido foi cancelado.</p>
            <Link to="/" className="mt-2 block text-xs font-semibold text-primary">
              Voltar para a loja
            </Link>
          </section>
        )}

        <Link
          to="/pedido/$id"
          params={{ id }}
          className="block rounded-2xl border border-border bg-card py-3 text-center text-sm font-bold"
        >
          Acompanhar pedido
        </Link>
      </div>
    </AppShell>
  );
}
