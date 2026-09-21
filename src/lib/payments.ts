import { supabase } from "@/integrations/supabase/client";

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  expirado: "Expirado",
  falhou: "Falhou",
  cancelado: "Cancelado",
  estornado: "Estornado",
};

export type AdminPayment = {
  id: string;
  order_id: string;
  order_number: number;
  provider: string;
  method: string;
  status: string;
  amount: number;
  currency: string;
  provider_charge_id: string | null;
  expires_at: string | null;
  paid_at: string | null;
  reconcile_flag: boolean;
  reconcile_reason: string | null;
  customer_name: string | null;
  order_status: string;
  created_at: string;
};

export async function fetchAdminPayments(filters: {
  status?: string | null;
  method?: string | null;
}) {
  const { data, error } = await supabase.rpc("admin_payments", {
    ...(filters.status ? { p_status: filters.status } : {}),
    ...(filters.method ? { p_method: filters.method } : {}),
    p_limit: 100,
    p_offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as AdminPayment[];
}

export function paymentErrorMessage(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (raw.includes("PAGARME_NAO_CONFIGURADO"))
    return "Pagamento online ainda não configurado. Escolha pagar na entrega.";
  if (raw.includes("SEM_COBRANCA_ONLINE")) return "Este pagamento não tem cobrança online.";
  if (raw.includes("MOTIVO_OBRIGATORIO")) return "Informe o motivo.";
  if (raw.includes("SEM_PERMISSAO")) return "Você não tem permissão para esta ação.";
  if (raw.includes("PEDIDO_FINALIZADO")) return "Este pedido já foi finalizado.";
  if (raw.includes("PAGARME_ERRO"))
    return "O provedor de pagamento recusou a operação. Tente novamente.";
  return "Não foi possível concluir. Tente novamente.";
}

export function timeLeft(expiresAt: string | null) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expirado";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}
