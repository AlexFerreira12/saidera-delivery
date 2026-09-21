import { describe, expect, it } from "vitest";
import { checkoutErrorMessage } from "@/lib/checkout";

describe("mensagens de erro do checkout", () => {
  it("traduz códigos conhecidos", () => {
    expect(checkoutErrorMessage("LOJA_FECHADA")).toContain("fechada");
    expect(checkoutErrorMessage("CARRINHO_VAZIO")).toContain("vazio");
    expect(checkoutErrorMessage("CUPOM_EXPIRADO")).toContain("expirado");
  });

  it("usa o detalhe do código quando existe", () => {
    expect(checkoutErrorMessage("ESTOQUE_INSUFICIENTE:Coca 2L")).toContain("Coca 2L");
  });

  it("aceita erro em formato de objeto", () => {
    expect(checkoutErrorMessage({ message: "FORA_DA_AREA" })).toContain("bairro");
  });

  it("tem retorno amigável para código desconhecido", () => {
    expect(checkoutErrorMessage("ALGO_ESTRANHO")).toBeTruthy();
  });
});
