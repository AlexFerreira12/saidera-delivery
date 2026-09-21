import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook da Pagar.me (Core v5).
 * O corpo recebido NUNCA decide o status: ele só indica qual cobrança
 * deve ser reconsultada na API da Pagar.me, e é a resposta da API que vale.
 */
export const Route = createFileRoute("/api/public/webhooks/pagarme")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["PAGARME_WEBHOOK_BASIC"];
        if (expected) {
          const header = request.headers.get("authorization") ?? "";
          const given = header.startsWith("Basic ") ? header.slice(6) : "";
          const want = btoa(expected);
          if (given.length !== want.length || given !== want) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        let payload: any = null;
        try {
          payload = await request.json();
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        const eventId: string | null = payload?.id ?? null;
        const eventType: string = payload?.type ?? "desconhecido";
        const obj = payload?.data ?? {};
        const chargeId: string | null =
          obj?.object === "charge" || String(obj?.id ?? "").startsWith("ch_")
            ? String(obj.id)
            : Array.isArray(obj?.charges) && obj.charges[0]?.id
              ? String(obj.charges[0].id)
              : null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (!chargeId) {
          await supabaseAdmin.from("payment_events").insert({
            provider: "pagarme",
            event_id: eventId,
            event_type: eventType,
            applied: false,
            note: "SEM_COBRANCA_NO_EVENTO",
          });
          return new Response("ok");
        }

        // evento repetido: registro único impede duplicidade
        if (eventId) {
          const { data: seen } = await supabaseAdmin
            .from("payment_events")
            .select("id")
            .eq("provider", "pagarme")
            .eq("event_id", eventId)
            .maybeSingle();
          if (seen) return new Response("ok");
        }

        try {
          const { getCharge, mapChargeStatus } = await import("@/lib/pagarme.server");
          const charge = await getCharge(chargeId);
          const status = mapChargeStatus(charge?.["status"] as string);
          await supabaseAdmin.rpc("payment_apply_status", {
            p_provider_charge_id: chargeId,
            p_status: status,
            p_amount_cents: Number(charge?.["amount"] ?? 0),
            p_currency: String(charge?.["currency"] ?? "BRL").toUpperCase(),
            p_event_id: eventId ?? "",
            p_event_type: eventType,
            p_summary: {
              id: charge?.["id"] ?? null,
              status: charge?.["status"] ?? null,
              amount: charge?.["amount"] ?? null,
              currency: charge?.["currency"] ?? null,
              paid_at: charge?.["paid_at"] ?? null,
            },
          });
        } catch (err) {
          console.error("webhook_pagarme_falha", String(err));
          return new Response("retry", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
