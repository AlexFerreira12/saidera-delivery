import { supabase } from "@/integrations/supabase/client";

export type StockKind =
  "saldo_inicial" | "entrada" | "venda" | "cancelamento" | "ajuste" | "perda" | "inventario";

export const STOCK_KIND_LABEL: Record<StockKind, string> = {
  saldo_inicial: "Saldo inicial",
  entrada: "Entrada",
  venda: "Venda",
  cancelamento: "Devolução (cancelamento)",
  ajuste: "Ajuste",
  perda: "Perda / quebra",
  inventario: "Inventário",
};

export type StockMovement = {
  id: string;
  product_id: string;
  product_name: string;
  kind: StockKind;
  quantity_delta: number;
  stock_before: number;
  stock_after: number;
  reason: string | null;
  order_id: string | null;
  order_number: number | null;
  actor_name: string | null;
  unit_cost: number | null;
  created_at: string;
};

export type StockProduct = {
  id: string;
  name: string;
  stock: number;
  min_stock: number;
  is_active: boolean;
  cost: number | null;
};

export async function fetchStockProducts() {
  const { data, error } = await supabase
    .from("products_admin")
    .select("id, name, stock, min_stock, is_active, cost")
    .order("name");
  if (error) throw error;
  return (data ?? []) as StockProduct[];
}

export async function fetchStockHistory(params: {
  productId?: string | undefined;
  kind?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit: number;
  offset: number;
}) {
  const args: Record<string, unknown> = {
    p_kind: params.kind || "",
    p_limit: params.limit,
    p_offset: params.offset,
  };
  if (params.productId) args["p_product_id"] = params.productId;
  if (params.from) args["p_from"] = params.from;
  if (params.to) args["p_to"] = params.to;

  const { data, error } = await supabase.rpc(
    "admin_stock_history",
    args as unknown as { p_limit: number; p_offset: number; p_kind: string },
  );
  if (error) throw error;
  return (data ?? []) as unknown as StockMovement[];
}

export async function stockEntry(
  productId: string,
  quantity: number,
  reason: string,
  unitCost?: number,
) {
  const { error } = await supabase.rpc("admin_stock_entry", {
    p_product_id: productId,
    p_quantity: quantity,
    p_reason: reason,
    ...(unitCost && unitCost > 0 ? { p_unit_cost: unitCost } : {}),
  });
  if (error) throw error;
}

export async function stockAdjust(
  productId: string,
  delta: number,
  kind: "ajuste" | "perda",
  reason: string,
) {
  const { error } = await supabase.rpc("admin_stock_adjust", {
    p_product_id: productId,
    p_delta: delta,
    p_kind: kind,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function stockInventory(productId: string, counted: number, reason: string) {
  const { data, error } = await supabase.rpc("admin_stock_inventory", {
    p_product_id: productId,
    p_counted: counted,
    p_reason: reason,
  });
  if (error) throw error;
  return data as unknown as { changed: boolean; stock: number };
}

export async function stockBulkEntry(
  items: { product_id: string; quantity: number }[],
  reason: string,
) {
  const { error } = await supabase.rpc("admin_stock_bulk_entry", {
    p_items: items,
    p_reason: reason,
  });
  if (error) throw error;
}

export function stockErrorMessage(error: unknown, fallback = "Não foi possível concluir.") {
  const raw =
    typeof error === "object" && error && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  if (raw.includes("SEM_PERMISSAO")) return "Você não tem permissão para esta operação.";
  if (raw.includes("QUANTIDADE_INVALIDA")) return "Informe uma quantidade válida.";
  if (raw.includes("MOTIVO_OBRIGATORIO")) return "Informe o motivo da operação.";
  if (raw.includes("TIPO_INVALIDO")) return "Tipo de operação inválido.";
  if (raw.includes("PRODUTO_NAO_ENCONTRADO")) return "Produto não encontrado.";
  if (raw.includes("LISTA_VAZIA")) return "Selecione ao menos um produto.";
  if (raw.includes("ESTOQUE_INSUFICIENTE"))
    return "Estoque insuficiente para essa saída — o estoque não pode ficar negativo.";
  return fallback;
}
