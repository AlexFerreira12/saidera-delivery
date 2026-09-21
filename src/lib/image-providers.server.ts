/**
 * Provedores de imagem de produto (server-only).
 * Cadeia: UPCitemdb (principal) → Open Food Facts (fallback) → upload manual.
 * Ambos têm API aberta, sem chave. Novos provedores autorizados (ex.: GS1)
 * entram aqui implementando o mesmo contrato de lookup.
 */
import { gtinsMatch, normalizeGtin } from "./gtin";
import type { ImageCandidate, ImageSearchResult } from "./product-image-types";

const OFF_API = "https://world.openfoodfacts.org/api/v2/product";
const OFF_FIELDS = "code,product_name,brands,image_url,image_front_url,images";
const USER_AGENT = "SaideraImageImport/1.0 (catalog admin tool)";
const TIMEOUT_MS = 10_000;

const OFF_PRIMARY_HOST = "https://images.openfoodfacts.org";
/** Espelho oficial do Open Food Facts (mesma infraestrutura, domínio .net). */
const OFF_MIRROR_HOST = "https://images.openfoodfacts.net";

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
  const imageUrl = pickImageUrl(p);
  const candidate: ImageCandidate = {
    provider: "open_food_facts",
    gtin: normalizeGtin(code),
    name: typeof name === "string" && name.trim() ? name.trim() : null,
    brand: typeof brands === "string" && brands.trim() ? brands.trim() : null,
    imageUrl,
    fallbackImageUrls: buildOfficialFallbackUrls(imageUrl, p),
    match: "exact",
  };
  if (!candidate.imageUrl) return { status: "no_image", candidate };
  return { status: "found", candidate };
}

/**
 * Monta alternativas de download usando SOMENTE domínios oficiais do OFF:
 * 1. mesmo caminho no espelho oficial (.net);
 * 2. a foto original (imgid) que gerou a imagem frontal selecionada, no espelho.
 * Nenhum host externo/proxy é adicionado aqui.
 */
export function buildOfficialFallbackUrls(
  imageUrl: string | null,
  product: Record<string, unknown>,
): string[] | undefined {
  if (!imageUrl || !imageUrl.startsWith(`${OFF_PRIMARY_HOST}/`)) return undefined;
  const path = imageUrl.slice(OFF_PRIMARY_HOST.length);
  const urls = [`${OFF_MIRROR_HOST}${path}`];
  const dir = path.slice(0, path.lastIndexOf("/") + 1);
  const imgid = selectedFrontImageId(product);
  if (imgid !== null) {
    urls.push(`${OFF_MIRROR_HOST}${dir}${imgid}.400.jpg`);
    urls.push(`${OFF_MIRROR_HOST}${dir}${imgid}.jpg`);
  }
  return [...new Set(urls)];
}

/** Extrai o imgid da foto original usada pela imagem frontal selecionada. */
function selectedFrontImageId(product: Record<string, unknown>): number | null {
  const images = product["images"];
  if (!images || typeof images !== "object") return null;
  for (const [key, value] of Object.entries(images as Record<string, unknown>)) {
    if (!key.startsWith("front")) continue;
    if (!value || typeof value !== "object") continue;
    const imgid = (value as Record<string, unknown>)["imgid"];
    if (typeof imgid === "number" && Number.isInteger(imgid) && imgid > 0) return imgid;
  }
  return null;
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
    const res = await fetch(`${OFF_API}/${encodeURIComponent(gtin)}.json?fields=${OFF_FIELDS}`, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "error", message: "PROVEDOR_INDISPONIVEL" };
    return parseOpenFoodFacts(await res.json(), gtin);
  } catch {
    return { status: "error", message: "PROVEDOR_INDISPONIVEL" };
  }
}
