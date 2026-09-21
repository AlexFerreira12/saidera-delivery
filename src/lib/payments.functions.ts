import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PIX_EXPIRES_SECONDS = 30 * 60;

type ChargeView = {
  status: string;
  amount: number;
  qr_code: string | null;
  copy_paste: string | null;
  expires_at: string | null;
  order_number: number;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type AdminDb = Awaited<ReturnType<typeof admin>>;

type PrepareInfo = {
  payment_id: string;
  order_number: number;
  status: string;
  amount: number;
  currency: string;
  provider_charge_id: string | null;
  expires_at: string | null;
  qr_code: string | null;
  copy_paste: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  live: boolean;
};

async function prepare(db: AdminDb, orderId: string, userId: string) {
  const { data, error } = await db.rpc("payment_prepare_charge", {
    p_order_id: orderId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return data as unknown as PrepareInfo;
}

async function applyFromProvider(
  db: AdminDb,
  chargeId: string,
  eventId: string | null,
  eventType: string,
) {
  const { getCharge, mapChargeStatus } = await import("./pagarme.server");
  const charge = await getCharge(chargeId);
  const status = mapChargeStatus(charge?.["status"] as string);
  const { error } = await db.rpc("payment_apply_status", {
    p_provider_charge_id: chargeId,
    p_status: status,
    p_amount_cents: Number(charge?.["amount"] ?? 0),
    p_currency: String(charge?.["currency"] ?? "BRL").toUpperCase(),
    p_event_id: eventId ?? "",
    p_event_type: eventType,
    p_summary: {
      id: String(charge?.["id"] ?? ""),
      status: String(charge?.["status"] ?? ""),
      amount: Number(charge?.["amount"] ?? 0),
      currency: String(charge?.["currency"] ?? ""),
      paid_at: String(charge?.["paid_at"] ?? ""),
    },

  });
  if (error) throw new Error(error.message);
  return status;
}

/** Cria (ou reaproveita) a cobrança PIX do pedido. Valor sempre vindo do banco. */
export const createPixCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }): Promise<ChargeView> => {
    const db = await admin();
    const info = await prepare(db, data.orderId, context.userId);

    if (info.live) {
      return {
        status: info.status,
        amount: Number(info.amount),
        qr_code: info.qr_code,
        copy_paste: info.copy_paste,
        expires_at: info.expires_at,
        order_number: info.order_number,
      };
    }
    if (info.status === "pago") {
      return {
        status: "pago",
        amount: Number(info.amount),
        qr_code: null,
        copy_paste: null,
        expires_at: null,
        order_number: info.order_number,
      };
    }

    const { createPixOrder, pagarmeConfigured } = await import("./pagarme.server");
    if (!pagarmeConfigured()) throw new Error("PAGARME_NAO_CONFIGURADO");

    const email =
      (context.claims as { email?: string } | null)?.email ??
      `pedido-${info.order_number}@bebidasguariba.app`;
    const idempotencyKey = `order-${data.orderId}-${Math.floor(Date.now() / (PIX_EXPIRES_SECONDS * 1000))}`;

    const charge = await createPixOrder({
      orderNumber: info.order_number,
      amountCents: Math.round(Number(info.amount) * 100),
      expiresInSeconds: PIX_EXPIRES_SECONDS,
      customerName: info.customer_name ?? "Cliente",
      customerEmail: email,
      customerPhone: info.customer_phone,
      idempotencyKey,
    });

    const { error } = await db.rpc("payment_attach_charge", {
      p_payment_id: info.payment_id,
      p_provider_order_id: charge.providerOrderId,
      p_provider_charge_id: charge.providerChargeId,
      p_qr: charge.qrCode ?? "",
      p_copy: charge.copyPaste ?? "",
      p_expires_at:
        charge.expiresAt ?? new Date(Date.now() + PIX_EXPIRES_SECONDS * 1000).toISOString(),
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new Error(error.message);

    return {
      status: "aguardando_pagamento",
      amount: Number(info.amount),
      qr_code: charge.qrCode,
      copy_paste: charge.copyPaste,
      expires_at:
        charge.expiresAt ?? new Date(Date.now() + PIX_EXPIRES_SECONDS * 1000).toISOString(),
      order_number: info.order_number,
    };
  });

/** Consulta a cobrança na Pagar.me e aplica o resultado (dono do pedido). */
export const syncPixPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }) => {
    const db = await admin();
    await db.rpc("payment_expire_due");
    const info = await prepare(db, data.orderId, context.userId);
    if (!info.provider_charge_id) return { status: info.status };
    if (info.status === "pago") return { status: "pago" };
    const status = await applyFromProvider(db, info.provider_charge_id, null, "consulta.cliente");
    return { status };
  });

async function assertAdmin(context: { userId: string; supabase: AdminDb }) {

  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("SEM_PERMISSAO");
}

/** Conciliação: admin consulta a cobrança no provedor e sincroniza. */
export const adminSyncPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { paymentId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { data: pay, error } = await db
      .from("payments")
      .select("id, provider, provider_charge_id, status")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!pay?.provider_charge_id) throw new Error("SEM_COBRANCA_ONLINE");
    const status = await applyFromProvider(db, pay.provider_charge_id, null, "consulta.admin");
    return { status };
  });

/** Estorno / cancelamento da cobrança na Pagar.me, com auditoria. */
export const adminRefundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { paymentId: string; reason: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.reason?.trim()) throw new Error("MOTIVO_OBRIGATORIO");
    const db = await admin();
    const { data: pay, error } = await db
      .from("payments")
      .select("id, provider_charge_id, amount")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!pay?.provider_charge_id) throw new Error("SEM_COBRANCA_ONLINE");

    const { cancelCharge } = await import("./pagarme.server");
    await cancelCharge(pay.provider_charge_id, Math.round(Number(pay.amount) * 100));
    const status = await applyFromProvider(db, pay.provider_charge_id, null, "estorno.admin");
    await db.from("payment_events").insert({
      payment_id: pay.id,
      provider: "pagarme",
      event_type: "admin.refund_request",
      provider_charge_id: pay.provider_charge_id,
      resolved_status: status,
      applied: true,
      note: data.reason.trim(),
    });
    return { status };
  });
