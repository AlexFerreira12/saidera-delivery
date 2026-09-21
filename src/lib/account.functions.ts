import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Dados pessoais do próprio cliente (LGPD: portabilidade).
 * Lê sempre como o próprio usuário, com as regras de acesso do banco.
 */
export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const userId = context.userId;

    const [profile, addresses, orders, favorites] = await Promise.all([
      db.from("profiles").select("*").eq("id", userId).maybeSingle(),
      db.from("addresses").select("*").eq("user_id", userId),
      db
        .from("orders")
        .select(
          "order_number, status, payment_method, payment_status, subtotal, delivery_fee, discount, total, coupon_code, created_at, delivered_at, order_items(product_name, quantity, unit_price, total_price)",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      db.from("favorites").select("product_id, created_at").eq("user_id", userId),
    ]);

    return {
      gerado_em: new Date().toISOString(),
      perfil: profile.data ?? null,
      enderecos: addresses.data ?? [],
      pedidos: orders.data ?? [],
      favoritos: favorites.data ?? [],
    };
  });

/**
 * Encerramento de conta: anonimiza os dados pessoais e encerra o acesso.
 * O histórico de pedidos é preservado de forma anônima porque é registro de venda.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { confirm: string }) => input)
  .handler(async ({ data, context }) => {
    if (data.confirm !== "ENCERRAR") throw new Error("CONFIRMACAO_INVALIDA");
    const userId = context.userId;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: openOrders } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("user_id", userId)
      .not("status", "in", "(entregue,cancelado)")
      .limit(1);
    if (openOrders && openOrders.length > 0) throw new Error("PEDIDO_EM_ANDAMENTO");

    await supabaseAdmin
      .from("profiles")
      .update({ full_name: "Cliente removido", phone: null, cpf: null, email: null })
      .eq("id", userId);

    await supabaseAdmin.from("addresses").delete().eq("user_id", userId);
    await supabaseAdmin.from("favorites").delete().eq("user_id", userId);
    await supabaseAdmin
      .from("orders")
      .update({ customer_name: "Cliente removido", customer_phone: null, address_snapshot: null })
      .eq("user_id", userId);

    // Encerra o acesso sem apagar o histórico de vendas ligado ao cadastro.
    await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });

    return { ok: true };
  });
