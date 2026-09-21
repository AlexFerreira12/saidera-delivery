import { describe, expect, it } from "vitest";
import { mapChargeStatus } from "@/lib/pagarme.server";
import { timeLeft } from "@/lib/payments";

describe("situação da cobrança", () => {
  it("só considera pago o que o provedor confirmou", () => {
    expect(mapChargeStatus("paid")).toBe("pago");
    expect(mapChargeStatus("overpaid")).toBe("pago");
    expect(mapChargeStatus("pending")).toBe("aguardando_pagamento");
    expect(mapChargeStatus("waiting_payment")).toBe("aguardando_pagamento");
    expect(mapChargeStatus("expired")).toBe("expirado");
    expect(mapChargeStatus("canceled")).toBe("cancelado");
    expect(mapChargeStatus("refunded")).toBe("estornado");
  });

  it("não inventa pagamento para situação desconhecida", () => {
    expect(mapChargeStatus("qualquer_coisa")).not.toBe("pago");
    expect(mapChargeStatus(null)).not.toBe("pago");
  });
});

describe("contagem regressiva do PIX", () => {
  it("marca como expirado quando a data já passou", () => {
    expect(timeLeft(new Date(Date.now() - 1000).toISOString())).toBe("expirado");
  });

  it("mostra minutos e segundos restantes", () => {
    const value = timeLeft(new Date(Date.now() + 65_000).toISOString());
    expect(value).toMatch(/^1:\d{2}$/);
  });

  it("devolve nulo sem data de expiração", () => {
    expect(timeLeft(null)).toBeNull();
  });
});
