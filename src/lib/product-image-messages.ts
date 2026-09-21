/**
 * Mensagens amigáveis (client-safe) para os resultados da automação de imagens.
 * O servidor retorna apenas códigos sanitizados; a tradução para texto acontece aqui.
 */
import type { ImageApplyResult, ImageSearchResult } from "./product-image-types";

const ERROR_MESSAGES: Record<string, string> = {
  DOWNLOAD_FALHOU:
    "A fonte encontrou a imagem, mas o download falhou (conexão lenta ou indisponível). Tente novamente.",
  URL_NAO_PERMITIDA: "O endereço da imagem não é permitido por segurança.",
  ARQUIVO_GRANDE: "A imagem da fonte excede o limite de 3 MB.",
  ARQUIVO_VAZIO: "A fonte retornou um arquivo vazio.",
  MIME_INVALIDO: "O arquivo não é uma imagem permitida (JPEG, PNG ou WebP).",
  TIPO_INVALIDO: "O conteúdo baixado não é uma imagem válida.",
  ARMAZENAMENTO_FALHOU: "Falha ao salvar a cópia da imagem no armazenamento.",
  SALVAR_FALHOU: "Falha ao atualizar o produto com a nova imagem.",
  PRODUTO_NAO_ENCONTRADO: "Produto não encontrado.",
  PROVEDOR_INDISPONIVEL: "A fonte de imagens está indisponível no momento. Tente novamente.",
  RESPOSTA_INVALIDA: "A fonte de imagens respondeu de forma inesperada.",
  FALHA: "Erro inesperado ao processar. Tente novamente.",
};

/** Traduz um código de erro sanitizado do servidor para texto amigável. */
export function friendlyImageError(code: string | undefined): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return ERROR_MESSAGES["FALHA"] ?? "Erro inesperado ao processar. Tente novamente.";
}

/** Mensagem para o resultado da pré-visualização individual. */
export function imageSearchMessage(result: ImageSearchResult): string {
  switch (result.status) {
    case "invalid_gtin":
      return "Este produto não tem um código de barras (GTIN/EAN) válido cadastrado.";
    case "not_found":
      return "Nenhum produto encontrado para este código no Open Food Facts.";
    case "gtin_mismatch":
      return "O código retornado não confere exatamente com o cadastrado. Busca rejeitada por segurança.";
    case "no_image":
      return "Produto encontrado, mas sem imagem disponível na fonte.";
    case "error":
      return friendlyImageError(result.message);
    default:
      return "";
  }
}

/** Motivo amigável de um item do lote que não aplicou imagem. */
export function imageApplyMessage(result: ImageApplyResult): string {
  switch (result.status) {
    case "applied":
      return "Imagem aplicada.";
    case "has_image":
      return "O produto já tinha imagem.";
    case "invalid_gtin":
      return "Código de barras (GTIN/EAN) inválido ou ausente.";
    case "not_found":
      return "Código não encontrado na fonte.";
    case "gtin_mismatch":
      return "O código retornado não confere; rejeitado por segurança.";
    case "no_image":
      return "Produto encontrado, mas sem imagem disponível.";
    case "error":
      return friendlyImageError(result.message);
  }
}
