/**
 * Cliente HTTP da Pagar.me Core v5 (uso exclusivo no servidor).
 * A Secret Key é lida apenas dentro das funções, nunca no escopo do módulo.
 */

const USER_AGENT = "pagarme-skill-generated/1.0";

function config() {
  const key = process.env["PAGARME_SECRET_KEY"];
  if (!key) throw new Error("PAGARME_NAO_CONFIGURADO");
  const base = process.env["PAGARME_BASE_URL"] ?? "https://api.pagar.me/core/v5";
  return { key, base: base.replace(/\/$/, "") };
}

export function pagarmeConfigured() {
  return Boolean(process.env["PAGARME_SECRET_KEY"]);
}

async function call(
  path: string,
  init: { method: string; body?: unknown; idempotencyKey?: string },
) {
  const { key, base } = config();
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${key}:`)}`,
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const requestInit: RequestInit = { method: init.method, headers };
  if (init.body !== undefined) requestInit.body = JSON.stringify(init.body);
  const res = await fetch(`${base}${path}`, requestInit);

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    console.error("pagarme_error", res.status, path);
    throw new Error(`PAGARME_ERRO_${res.status}`);
  }
  return (json ?? {}) as Record<string, unknown>;
}

export type PixCharge = {
  providerOrderId: string;
  providerChargeId: string;
  qrCode: string | null;
  copyPaste: string | null;
  expiresAt: string | null;
  status: string;
};

/** Cria um pedido com cobrança PIX. O valor vem sempre do banco, em centavos. */
export async function createPixOrder(input: {
  orderNumber: number;
  amountCents: number;
  expiresInSeconds: number;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  idempotencyKey: string;
}): Promise<PixCharge> {
  const body = {
    code: `pedido-${input.orderNumber}`,
    closed: true,
    customer: {
      name: input.customerName || "Cliente",
      email: input.customerEmail,
      type: "individual",
    },
    items: [
      {
        amount: input.amountCents,
        description: `Pedido #${input.orderNumber}`,
        quantity: 1,
      },
    ],
    payments: [
      {
        payment_method: "pix",
        pix: {
          expires_in: input.expiresInSeconds,
          additional_information: [{ name: "Pedido", value: `#${input.orderNumber}` }],
        },
      },
    ],
  };

  const data = await call("/orders", {
    method: "POST",
    body,
    idempotencyKey: input.idempotencyKey,
  });

  const charges = data["charges"] as Array<Record<string, unknown>> | undefined;
  const charge = Array.isArray(charges) ? charges[0] : undefined;
  if (!charge?.["id"]) throw new Error("PAGARME_SEM_COBRANCA");
  const tx = (charge["last_transaction"] ?? {}) as Record<string, unknown>;
  return {
    providerOrderId: String(data["id"] ?? ""),
    providerChargeId: String(charge["id"]),
    qrCode: (tx["qr_code_url"] as string | undefined) ?? null,
    copyPaste: (tx["qr_code"] as string | undefined) ?? null,
    expiresAt: (tx["expires_at"] as string | undefined) ?? null,
    status: String(charge["status"] ?? "pending"),
  };
}

export async function getCharge(chargeId: string) {
  return call(`/charges/${encodeURIComponent(chargeId)}`, { method: "GET" });
}

export async function cancelCharge(chargeId: string, amountCents?: number) {
  return call(`/charges/${encodeURIComponent(chargeId)}`, {
    method: "DELETE",
    body: amountCents ? { amount: amountCents } : undefined,
  });
}

/** Traduz o status da Pagar.me para o status interno do app. */
export function mapChargeStatus(status: string | null | undefined): string {
  switch ((status ?? "").toLowerCase()) {
    case "paid":
    case "overpaid":
      return "pago";
    case "pending":
    case "processing":
    case "generated":
    case "waiting_payment":
      return "aguardando_pagamento";
    case "canceled":
      return "cancelado";
    case "failed":
    case "not_paid":
    case "payment_failed":
      return "falhou";
    case "refunded":
    case "partial_refunded":
    case "chargedback":
      return "estornado";
    case "expired":
    case "underpaid":
      return "expirado";
    default:
      return "aguardando_pagamento";
  }
}
