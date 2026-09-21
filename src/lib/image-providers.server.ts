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

// ---------------------------------------------------------------------------
// UPCitemdb (provedor principal) — API trial aberta, sem chave.
// ---------------------------------------------------------------------------

const UPC_API = "https://api.upcitemdb.com/prod/trial/lookup";
/** Limite do lote: no máximo 1 lookup a cada 10 segundos no UPCitemdb. */
const UPC_MIN_INTERVAL_MS = 10_000;
/** Retry-After máximo que ainda vale esperar dentro da requisição. */
const UPC_MAX_RETRY_WAIT_S = 20;
const UPC_MAX_IMAGE_URLS = 6;

/**
 * Pacer best-effort por instância do servidor: garante o intervalo mínimo
 * entre lookups UPCitemdb mesmo se a tela disparar chamadas seguidas.
 */
let lastUpcLookupAt = 0;

/** Reseta o pacer — somente para testes. */
export function __resetUpcItemdbPacerForTests(): void {
  lastUpcLookupAt = 0;
}

async function paceUpcItemdb(): Promise<void> {
  const now = Date.now();
  const wait = UPC_MIN_INTERVAL_MS - (now - lastUpcLookupAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastUpcLookupAt = Date.now();
}

/**
 * Política de URL para imagens vindas do UPCitemdb: a API retorna CDNs de
 * varejistas que não podemos enumerar, então em vez de allowlist de hosts
 * exigimos HTTPS público estrito — sem localhost, sem IP literal (v4/v6,
 * decimal/hex), sem nomes internos, sem userinfo e sem porta fora de 443.
 */
export function isPublicHttpsImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  if (!host || !host.includes(".")) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (/\.(local|internal|lan|home|corp|arpa|intranet)$/.test(host)) return false;
  // Qualquer IP literal é rejeitado: CDNs públicas legítimas usam nome DNS.
  if (host.startsWith("[") || host.includes(":")) return false; // IPv6 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false; // IPv4 literal
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+(\.\d+)*$/i.test(host)) return false; // notações alternativas
  return true;
}

/** Interpreta Retry-After em segundos ou HTTP-date. Função pura para testes. */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.ceil(seconds), 3600);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.min(Math.max(0, Math.ceil((date - Date.now()) / 1000)), 3600);
  return null;
}

/** Filtra URLs de imagem utilizáveis: somente HTTPS público, sem duplicatas. */
function usableUpcImageUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const out: string[] = [];
  for (const u of images) {
    if (typeof u === "string" && isPublicHttpsImageUrl(u) && !out.includes(u)) out.push(u);
    if (out.length >= UPC_MAX_IMAGE_URLS) break;
  }
  return out;
}

/** Interpreta a resposta do UPCitemdb. Função pura para testes. */
export function parseUpcItemdb(body: unknown, gtin: string): ImageSearchResult {
  if (!body || typeof body !== "object") return { status: "error", message: "RESPOSTA_INVALIDA" };
  const root = body as Record<string, unknown>;
  if (root["code"] !== "OK") return { status: "error", message: "PROVEDOR_INDISPONIVEL" };
  const rawItems = root["items"];
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (items.length === 0) return { status: "not_found" };
  const item = items.find((it): it is Record<string, unknown> => {
    if (!it || typeof it !== "object") return false;
    const rec = it as Record<string, unknown>;
    const ean = rec["ean"];
    const upc = rec["upc"];
    return (
      gtinsMatch(typeof ean === "string" ? ean : null, gtin) ||
      gtinsMatch(typeof upc === "string" ? upc : null, gtin)
    );
  });
  // Regra de segurança: só aceita correspondência exata de GTIN; nunca inferir por nome.
  if (!item) return { status: "gtin_mismatch" };

  const title = item["title"];
  const brand = item["brand"];
  const urls = usableUpcImageUrls(item["images"]);
  const candidate: ImageCandidate = {
    provider: "upcitemdb",
    gtin: normalizeGtin(gtin),
    name: typeof title === "string" && title.trim() ? title.trim() : null,
    brand: typeof brand === "string" && brand.trim() ? brand.trim() : null,
    imageUrl: urls[0] ?? null,
    fallbackImageUrls: urls.length > 1 ? urls.slice(1) : undefined,
    match: "exact",
  };
  if (!candidate.imageUrl) return { status: "no_image", candidate };
  return { status: "found", candidate };
}

async function fetchUpcItemdb(gtin: string): Promise<Response> {
  await paceUpcItemdb();
  return fetch(`${UPC_API}?upc=${encodeURIComponent(gtin)}`, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * Consulta o UPCitemdb pelo GTIN. Nunca lança: falhas viram status "error".
 * HTTP 429: respeita Retry-After e tenta UMA vez; persistindo, retorna
 * "rate_limited" e a cadeia segue para o fallback.
 */
export async function lookupUpcItemdb(gtin: string): Promise<ImageSearchResult> {
  try {
    let res = await fetchUpcItemdb(gtin);
    if (res.status === 429) {
      const wait = parseRetryAfter(res.headers.get("retry-after"));
      if (wait !== null && wait <= UPC_MAX_RETRY_WAIT_S) {
        if (wait > 0) await new Promise((r) => setTimeout(r, wait * 1000));
        res = await fetchUpcItemdb(gtin);
      }
      if (res.status === 429) return { status: "rate_limited" };
    }
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "error", message: "PROVEDOR_INDISPONIVEL" };
    return parseUpcItemdb(await res.json(), gtin);
  } catch {
    return { status: "error", message: "PROVEDOR_INDISPONIVEL" };
  }
}

/**
 * Cadeia de provedores: UPCitemdb → Open Food Facts → (upload manual, fora
 * deste fluxo). Sem imagem aplicável em nenhum provedor, retorna o resultado
 * mais informativo para o relatório (no_image > gtin_mismatch > not_found >
 * falha/limite acionável).
 */
export async function lookupProductImageByGtin(gtin: string): Promise<ImageSearchResult> {
  const upc = await lookupUpcItemdb(gtin);
  if (upc.status === "found") return upc;

  const off = await lookupOpenFoodFacts(gtin);
  if (off.status === "found") return off;

  if (upc.status === "no_image") return upc;
  if (off.status === "no_image") return off;
  if (upc.status === "gtin_mismatch" || off.status === "gtin_mismatch") {
    return { status: "gtin_mismatch" };
  }
  if (upc.status === "not_found" && off.status === "not_found") return off;
  // Um provedor disse "não encontrado" e o outro falhou/limitou: relata a
  // falha acionável para o admin tentar novamente.
  return upc.status === "not_found" ? off : upc;
}
