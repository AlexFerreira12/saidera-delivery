/**
 * Tipos compartilhados (client-safe) da automação de imagens de produtos.
 */

export type ImageCandidate = {
  provider: "open_food_facts";
  gtin: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  /**
   * URLs oficiais alternativas (somente domínios do Open Food Facts), tentadas
   * em ordem quando imageUrl falha: mesmo caminho no espelho oficial e a foto
   * original (imgid) que gerou a imagem frontal selecionada.
   */
  fallbackImageUrls?: string[] | undefined;
  match: "exact";
};

export type ImageSearchResult =
  | { status: "found"; candidate: ImageCandidate }
  | { status: "no_image"; candidate: ImageCandidate }
  | { status: "not_found" }
  | { status: "gtin_mismatch" }
  | { status: "invalid_gtin" }
  | { status: "error"; message: string };

export type ImageApplyResult =
  | { status: "applied"; url: string; candidate: ImageCandidate }
  | { status: "has_image" }
  | { status: "no_image"; candidate: ImageCandidate }
  | { status: "not_found" }
  | { status: "gtin_mismatch" }
  | { status: "invalid_gtin" }
  | { status: "error"; message: string };
