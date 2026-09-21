/**
 * Provedores de imagem de produto (server-only). Começa com Open Food Facts
 * (API aberta, sem chave). Novos provedores autorizados (ex.: GS1) entram aqui
 * implementando o mesmo contrato de lookup.
 */
import { gtinsMatch, normalizeGtin } from "./gtin";
import type { ImageCandidate, ImageSearchResult } from "./product-image-types";

const OFF_API = "https://world.openfoodfacts.org/api/v2/product";
const OFF_FIELDS = "code,product_name,brands,image_url,image_front_url";
const USER_AGENT = "SaideraImageImport/1.0 (catalog admin tool)";
const TIMEOUT_MS = 10_000;

/** Interpreta a resposta do Open Food Facts. Função pura para testes. */
export function parseOpenFoodFacts(body: unknown, gtin: string): ImageSearchResult {
  if (!body || typeof body !== "object") return { status: "error", message: "RESPOSTA_INVALIDA" };
  const root = body as Record<string, unknown>;
  if (root["status"] !== 1 || !root["product"] || typeof root["product"] !== "object") {
    return { status: "not_found" };
  }
  const p = root["product"] as Record<string, unknown>;
  const rawCode = p["code"] ?? root["code"];
  const code = typeof rawCode === "string" ? rawCode : "";
  // Regra de segurança: só aceita correspondência exata de GTIN; nunca inferir por nome.
  if (!gtinsMatch(code, gtin)) return { status: "gtin_mismatch" };

  const name = p["product_name"];
  const brands = p["brands"];
  const candidate: ImageCandidate = {
    provider: "open_food_facts",
    gtin: normalizeGtin(code),
    name: typeof name === "string" && name.trim() ? name.trim() : null,
    brand: typeof brands === "string" && brands.trim() ? brands.trim() : null,
    imageUrl: pickImageUrl(p),
    match: "exact",
  };
  if (!candidate.imageUrl) return { status: "no_image", candidate };
  return { status: "found", candidate };
}

function pickImageUrl(p: Record<string, unknown>): string | null {
  for (const key of ["image_front_url", "image_url"]) {
    const value = p[key];
    if (typeof value === "string" && value.startsWith("https://")) return value;
  }
  return null;
}

/** Consulta o Open Food Facts pelo GTIN. Nunca lança: falhas viram status "error". */
export async function lookupOpenFoodFacts(gtin: string): Promise<ImageSearchResult> {
  try {
    const res = await fetch(
      `${OFF_API}/${encodeURIComponent(gtin)}.json?fields=${OFF_FIELDS}`,
      {
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "error", message: "PROVEDOR_INDISPONIVEL" };
    return parseOpenFoodFacts(await res.json(), gtin);
  } catch {
    return { status: "error", message: "PROVEDOR_INDISPONIVEL" };
  }
}
