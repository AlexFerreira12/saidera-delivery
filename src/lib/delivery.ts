import { supabase } from "@/integrations/supabase/client";

export type AvailableOrder = {
  id: string;
  order_number: number;
  neighborhood: string;
  street: string;
  items_count: number;
  total: number;
  payment_method: string;
  eta_minutes: number | null;
  created_at: string;
};

export type DriverOrderAddress = {
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  reference: string | null;
};

export type DriverOrder = {
  id: string;
  order_number: number;
  status: string;
  total: number;
  payment_method: string;
  notes: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  eta_minutes: number | null;
  accepted_at: string | null;
  created_at: string;
  pin_attempts: number;
  address: DriverOrderAddress;
  items: { id: string; name: string; quantity: number }[];
};

export type DriverHistory = {
  rows: {
    id: string;
    order_number: number;
    total: number;
    neighborhood: string | null;
    delivered_at: string | null;
    confirmed_by: string | null;
  }[];
  today: number;
  week: number;
  total: number;
};

const DELIVERY_ERRORS: Record<string, string> = {
  NAO_AUTENTICADO: "Faça login para continuar.",
  SEM_PERMISSAO: "Você não tem permissão para esta ação.",
  ENTREGADOR_NAO_CADASTRADO: "Seu cadastro de entregador não está ativo. Fale com o administrador.",
  ENTREGADOR_NAO_ENCONTRADO: "Entregador não encontrado ou inativo.",
  ENTREGA_JA_ACEITA: "Outro entregador aceitou este pedido primeiro.",
  PEDIDO_NAO_DISPONIVEL: "Este pedido não está mais disponível.",
  PEDIDO_NAO_ENCONTRADO: "Pedido não encontrado.",
  PEDIDO_FINALIZADO: "Este pedido já foi finalizado.",
  PEDIDO_SEM_ENTREGADOR: "Este pedido não tem entregador atribuído.",
  MOTIVO_OBRIGATORIO: "Informe o motivo.",
  PIN_INVALIDO: "Código incorreto. Confira com o cliente.",
  PIN_BLOQUEADO: "Código bloqueado por tentativas. Peça ajuda ao administrador.",
};

export function deliveryErrorMessage(error: unknown) {
  const raw =
    typeof error === "string"
      ? error
      : ((error as { message?: string } | null)?.message ?? "Erro inesperado.");
  const key = raw.split(":")[0]?.trim() ?? "";
  return DELIVERY_ERRORS[key] ?? raw;
}

export async function fetchAvailableOrders() {
  const { data, error } = await supabase.rpc("driver_available_orders");
  if (error) throw error;
  return (data ?? []) as unknown as AvailableOrder[];
}

export async function fetchMyDeliveries() {
  const { data, error } = await supabase.rpc("driver_my_orders");
  if (error) throw error;
  return (data ?? []) as unknown as DriverOrder[];
}

export async function fetchDriverHistory(limit = 20, offset = 0) {
  const { data, error } = await supabase.rpc("driver_history", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return data as unknown as DriverHistory;
}

export async function acceptDelivery(orderId: string) {
  const { error } = await supabase.rpc("accept_delivery", { p_order_id: orderId });
  if (error) throw error;
}

export async function completeDelivery(orderId: string, pin: string) {
  const { data, error } = await supabase.rpc("driver_complete_delivery", {
    p_order_id: orderId,
    p_pin: pin,
  });
  if (error) throw error;
  const result = data as unknown as { ok: boolean; code?: string };
  if (!result.ok) throw new Error(result.code ?? "PIN_INVALIDO");
}

export async function fetchOrderPin(orderId: string) {
  const { data, error } = await supabase
    .from("order_delivery_pins")
    .select("pin")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw error;
  return data?.pin ?? null;
}

export async function adminAssignDriver(orderId: string, driverId: string) {
  const { error } = await supabase.rpc("admin_assign_driver", {
    p_order_id: orderId,
    p_driver_id: driverId,
  });
  if (error) throw error;
}

export async function adminUnassignDriver(orderId: string, reason: string) {
  const { error } = await supabase.rpc("admin_unassign_driver", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function adminForceDeliver(orderId: string, reason: string) {
  const { error } = await supabase.rpc("admin_force_deliver", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw error;
}

export function mapsUrl(address: Partial<DriverOrderAddress>) {
  const query = [
    address.street,
    address.number,
    address.neighborhood,
    address.city ?? "Guariba",
    "SP",
  ]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function addressText(address: Partial<DriverOrderAddress>) {
  const base = [address.street, address.number].filter(Boolean).join(", ");
  const extra = [address.complement, address.neighborhood, address.city]
    .filter(Boolean)
    .join(" — ");
  return [base, extra].filter(Boolean).join(" — ");
}
