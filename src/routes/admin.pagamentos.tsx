import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { brl, dateTimeBR } from "@/lib/format";
import { fetchAdminPayments, paymentErrorMessage, PAYMENT_STATUS_LABEL } from "@/lib/payments";
import { adminRefundPayment, adminSyncPayment } from "@/lib/payments.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminHeading,
  AdminPage,
  Card,
  GhostButton,
  StateBlock,
  inputClass,
} from "@/components/admin/ui";

export const Route = createFileRoute("/admin/pagamentos")({
  component: AdminPayments,
});

const STATUSES = [
  "",
  "aguardando_pagamento",
  "pago",
  "expirado",
  "falhou",
  "cancelado",
  "estornado",
];
const METHODS = ["", "pix", "dinheiro", "cartao_entrega"];

function AdminPayments() {
  const qc = useQueryClient();
  const sync = useServerFn(adminSyncPayment);
  const refund = useServerFn(adminRefundPayment);
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const {
    data: payments,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "payments", status, method],
    queryFn: () => fetchAdminPayments({ status, method }),
  });

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["admin", "payments"] });
      toast.success(ok);
    } catch (err) {
      toast.error(paymentErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const manualSettle = async (id: string) => {
    const reason = window.prompt("Motivo da baixa manual (obrigatório):");
    if (!reason?.trim()) return;
    await run(
      id,
      async () => {
        const { error: err } = await supabase.rpc("admin_payment_manual_settle", {
          p_payment_id: id,
          p_reason: reason.trim(),
        });
        if (err) throw err;
      },
      "Pagamento baixado manualmente.",
    );
  };

  return (
    <AdminPage>
      <AdminHeading title="Pagamentos" />

      <div className="flex gap-2">
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? (PAYMENT_STATUS_LABEL[s] ?? s) : "Todas as situações"}
            </option>
          ))}
        </select>
        <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m || "Todos os métodos"}
            </option>
          ))}
        </select>
      </div>

      <StateBlock
        loading={isLoading}
        error={error}
        empty={(payments ?? []).length === 0}
        emptyText="Nenhum pagamento encontrado."
      />

      <div className="space-y-2">
        {(payments ?? []).map((p) => (
          <Card key={p.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-sm font-bold">
                  Pedido #{p.order_number} · {brl(Number(p.amount))}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.customer_name ?? "cliente"} · {p.method} · {p.provider}
                </p>
                <p className="text-xs text-muted-foreground">{dateTimeBR(p.created_at)}</p>
                {p.provider_charge_id && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    Ref.: {p.provider_charge_id}
                  </p>
                )}
                {p.reconcile_flag && (
                  <p className="text-[11px] font-semibold text-destructive">
                    Conferir: {p.reconcile_reason}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold ${
                  p.status === "pago"
                    ? "bg-success/15 text-success"
                    : p.status === "aguardando_pagamento"
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {p.provider_charge_id && (
                <GhostButton
                  disabled={busy === p.id}
                  onClick={() =>
                    run(p.id, () => sync({ data: { paymentId: p.id } }), "Situação sincronizada.")
                  }
                >
                  Consultar no provedor
                </GhostButton>
              )}
              {p.provider_charge_id && p.status === "pago" && (
                <GhostButton
                  disabled={busy === p.id}
                  onClick={() => {
                    const reason = window.prompt("Motivo do estorno (obrigatório):");
                    if (!reason?.trim()) return;
                    void run(
                      p.id,
                      () => refund({ data: { paymentId: p.id, reason: reason.trim() } }),
                      "Estorno solicitado.",
                    );
                  }}
                >
                  Estornar
                </GhostButton>
              )}
              {p.status !== "pago" && (
                <GhostButton disabled={busy === p.id} onClick={() => void manualSettle(p.id)}>
                  Baixa manual
                </GhostButton>
              )}
            </div>
          </Card>
        ))}
      </div>
    </AdminPage>
  );
}
