import { describe, expect, it } from "vitest";
import { ORDER_FLOW, STATUS_LABEL, nextStatus, statusIndex } from "@/lib/orders";
import { deliveryErrorMessage, mapsUrl } from "@/lib/delivery";

describe("fluxo de status do pedido", () => {
  it("avança só na ordem prevista", () => {
    expect(nextStatus("novo")).toBe("confirmado");
    expect(nextStatus("pronto")).toBe("saiu_para_entrega");
    expect(nextStatus("saiu_para_entrega")).toBe("entregue");
  });

  it("não avança de entregue nem de status desconhecido", () => {
    expect(nextStatus("entregue")).toBeNull();
    expect(nextStatus("cancelado")).toBeNull();
    expect(nextStatus("qualquer")).toBeNull();
  });

  it("aguardando pagamento fica fora do fluxo operacional", () => {
    expect(statusIndex("aguardando_pagamento")).toBe(-1);
    expect(ORDER_FLOW).not.toContain("aguardando_pagamento");
    expect(STATUS_LABEL["aguardando_pagamento"]).toBe("Aguardando pagamento");
  });
});

describe("mensagens de entrega", () => {
  it("traduz códigos conhecidos", () => {
    expect(deliveryErrorMessage(new Error("PIN_INVALIDO"))).toMatch(/c[óo]digo/i);
    expect(deliveryErrorMessage(new Error("ENTREGA_JA_ACEITA"))).toMatch(/.+/);
  });

  it("nunca devolve mensagem vazia", () => {
    expect(deliveryErrorMessage(new Error("ALGO_DESCONHECIDO")).length).toBeGreaterThan(3);
    expect(deliveryErrorMessage(null).length).toBeGreaterThan(3);
  });
});

describe("link de rota", () => {
  it("gera link de mapas com o endereço codificado", () => {
    const url = mapsUrl({ street: "Rua A", number: "10", neighborhood: "Centro" });
    expect(url).toContain("http");
    expect(url).toContain("Rua");
  });
});
