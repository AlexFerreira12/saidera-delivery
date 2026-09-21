export const ORDER_FLOW = [
  "novo",
  "confirmado",
  "em_preparo",
  "pronto",
  "saiu_para_entrega",
  "entregue",
] as const;

export type OrderStatus = (typeof ORDER_FLOW)[number] | "cancelado";

export const STATUS_LABEL: Record<string, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  novo: "Pedido recebido",
  confirmado: "Confirmado",
  em_preparo: "Em separação",
  pronto: "Pronto para entrega",
  saiu_para_entrega: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};


export const PAYMENT_LABEL: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro na entrega",
  cartao_entrega: "Cartão na entrega",
};

export function statusIndex(status: string) {
  return ORDER_FLOW.indexOf(status as (typeof ORDER_FLOW)[number]);
}

export function nextStatus(status: string) {
  const i = statusIndex(status);
  if (i < 0 || i >= ORDER_FLOW.length - 1) return null;
  return ORDER_FLOW[i + 1] ?? null;
}
