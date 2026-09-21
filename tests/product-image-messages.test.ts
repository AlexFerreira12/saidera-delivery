import { describe, expect, it } from "vitest";
import {
  friendlyImageError,
  imageApplyMessage,
  imageSearchMessage,
} from "@/lib/product-image-messages";

describe("friendlyImageError", () => {
  it("traduz DOWNLOAD_FALHOU para motivo amigável de rede", () => {
    expect(friendlyImageError("DOWNLOAD_FALHOU")).toMatch(/download falhou/i);
  });

  it("traduz códigos de validação de arquivo", () => {
    expect(friendlyImageError("ARQUIVO_GRANDE")).toMatch(/3 MB/);
    expect(friendlyImageError("MIME_INVALIDO")).toMatch(/JPEG, PNG ou WebP/);
    expect(friendlyImageError("TIPO_INVALIDO")).toMatch(/não é uma imagem válida/i);
  });

  it("traduz falhas de armazenamento e salvamento", () => {
    expect(friendlyImageError("ARMAZENAMENTO_FALHOU")).toMatch(/armazenamento/i);
    expect(friendlyImageError("SALVAR_FALHOU")).toMatch(/atualizar o produto/i);
  });

  it("códigos desconhecidos ou ausentes caem na mensagem genérica", () => {
    expect(friendlyImageError(undefined)).toMatch(/Erro inesperado/);
    expect(friendlyImageError("QUALQUER_COISA")).toMatch(/Erro inesperado/);
    expect(friendlyImageError("")).toMatch(/Erro inesperado/);
  });

  it("nunca ecoa o código bruto do servidor na mensagem", () => {
    for (const code of ["DOWNLOAD_FALHOU", "MIME_INVALIDO", undefined]) {
      expect(friendlyImageError(code)).not.toMatch(/^[A-Z_]+$/);
    }
  });
});

describe("imageApplyMessage", () => {
  it("cobre todos os status do resultado de aplicação", () => {
    expect(imageApplyMessage({ status: "applied", url: "/x", candidate: null as never })).toMatch(
      /aplicada/i,
    );
    expect(imageApplyMessage({ status: "has_image" })).toMatch(/já tinha imagem/i);
    expect(imageApplyMessage({ status: "invalid_gtin" })).toMatch(/código de barras/i);
    expect(imageApplyMessage({ status: "not_found" })).toMatch(/não encontrado/i);
    expect(imageApplyMessage({ status: "gtin_mismatch" })).toMatch(/não confere/i);
    expect(
      imageApplyMessage({
        status: "no_image",
        candidate: null as never,
      }),
    ).toMatch(/sem imagem/i);
    expect(imageApplyMessage({ status: "error", message: "DOWNLOAD_FALHOU" })).toMatch(
      /download falhou/i,
    );
    expect(imageApplyMessage({ status: "error", message: "FALHA" })).toMatch(/Erro inesperado/);
  });
});

describe("imageSearchMessage", () => {
  it("erro de rede na busca individual usa o motivo amigável", () => {
    expect(imageSearchMessage({ status: "error", message: "PROVEDOR_INDISPONIVEL" })).toMatch(
      /indisponível/i,
    );
  });

  it("mantém mensagens específicas por status", () => {
    expect(imageSearchMessage({ status: "invalid_gtin" })).toMatch(/código de barras/i);
    expect(imageSearchMessage({ status: "not_found" })).toMatch(/Nenhum produto encontrado/i);
    expect(imageSearchMessage({ status: "gtin_mismatch" })).toMatch(/rejeitada por segurança/i);
    expect(imageSearchMessage({ status: "no_image", candidate: null as never })).toMatch(
      /sem imagem disponível/i,
    );
  });
});
