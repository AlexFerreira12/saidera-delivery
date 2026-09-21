/**
 * Importação segura de imagens de produto (server-only).
 * - SSRF: somente HTTPS, hosts na allowlist do provedor, redirect revalidado.
 * - Timeout, limite de tamanho, MIME permitido e assinatura binária.
 * - A cópia final vai para o bucket privado "catalogo" e o produto passa a
 *   apontar para a rota interna /api/public/imagem/... (sem hotlink externo).
 */
import { isValidGtin, normalizeGtin } from "./gtin";
import { lookupOpenFoodFacts } from "./image-providers.server";
import { IMAGE_MIME_BY_EXT, sniffImageType } from "./image-bytes";
import type { ImageApplyResult, ImageSearchResult } from "./product-image-types";

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10_000;
const USER_AGENT = "SaideraImageImport/1.0 (catalog admin tool)";

const ALLOWED_IMAGE_HOSTS = new Set([
  "images.openfoodfacts.org",
  "images.openfoodfacts.net",
  "static.openfoodfacts.org",
]);

/** Allowlist SSRF: somente HTTPS e hosts conhecidos do provedor. */
export function isAllowedImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

type DownloadedImage = { bytes: Uint8Array; ext: "jpg" | "png" | "webp"; contentType: string };

/** Baixa uma imagem remota com todas as proteções. Lança Error com código sanitizado. */
export async function downloadImageGuarded(url: string): Promise<DownloadedImage> {
  if (!isAllowedImageUrl(url)) throw new Error("URL_NAO_PERMITIDA");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "image/*" },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch {
    throw new Error("DOWNLOAD_FALHOU");
  }
  // Revalida o host final após redirects — um redirect não pode sair da allowlist.
  if (!res.ok || !isAllowedImageUrl(res.url || url)) throw new Error("DOWNLOAD_FALHOU");

  const declaredLength = Number(res.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error("ARQUIVO_GRANDE");

  const mime = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new Error("MIME_INVALIDO");

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("ARQUIVO_VAZIO");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("ARQUIVO_GRANDE");

  const ext = sniffImageType(bytes);
  if (!ext) throw new Error("TIPO_INVALIDO");
  return { bytes, ext, contentType: IMAGE_MIME_BY_EXT[ext] };
}

async function getAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Pré-visualização: consulta o provedor e retorna o candidato, sem aplicar nada. */
export async function previewProductImageById(productId: string): Promise<ImageSearchResult> {
  const supabase = await getAdminClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, barcode")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { status: "error", message: "PRODUTO_NAO_ENCONTRADO" };

  const gtin = normalizeGtin(product.barcode);
  if (!isValidGtin(gtin)) return { status: "invalid_gtin" };
  return lookupOpenFoodFacts(gtin);
}

/**
 * Aplica a imagem: consulta o provedor, baixa com proteções, grava cópia no
 * bucket e aponta o produto para a imagem interna. Registra a proveniência.
 * allowReplace=false nunca sobrescreve uma imagem existente (usado no lote).
 */
export async function applyProductImageById(
  productId: string,
  allowReplace: boolean,
): Promise<ImageApplyResult> {
  const supabase = await getAdminClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, barcode, image_url")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { status: "error", message: "PRODUTO_NAO_ENCONTRADO" };
  if (product.image_url && !allowReplace) return { status: "has_image" };

  const gtin = normalizeGtin(product.barcode);
  if (!isValidGtin(gtin)) return { status: "invalid_gtin" };

  const lookup = await lookupOpenFoodFacts(gtin);
  if (lookup.status !== "found") return lookup;
  const candidate = lookup.candidate;

  // Idempotência: se a mesma imagem de origem já foi importada, não baixa de novo.
  if (product.image_url?.startsWith("/api/public/imagem/")) {
    const { data: provenance } = await supabase
      .from("product_image_provenance")
      .select("source_url")
      .eq("product_id", productId)
      .maybeSingle();
    if (provenance?.source_url === candidate.imageUrl) {
      return { status: "applied", url: product.image_url, candidate };
    }
  }

  let image: DownloadedImage;
  try {
    image = await downloadImageGuarded(candidate.imageUrl ?? "");
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "DOWNLOAD_FALHOU" };
  }

  const path = `produtos/${crypto.randomUUID()}.${image.ext}`;
  const { error: uploadError } = await supabase.storage
    .from("catalogo")
    .upload(path, image.bytes, { contentType: image.contentType, upsert: false });
  if (uploadError) return { status: "error", message: "ARMAZENAMENTO_FALHOU" };

  const internalUrl = `/api/public/imagem/${path}`;
  const { error: updateError } = await supabase
    .from("products")
    .update({ image_url: internalUrl })
    .eq("id", productId);
  if (updateError) {
    await supabase.storage.from("catalogo").remove([path]);
    return { status: "error", message: "SALVAR_FALHOU" };
  }

  await supabase.from("product_image_provenance").upsert({
    product_id: productId,
    provider: candidate.provider,
    gtin: candidate.gtin,
    source_url: candidate.imageUrl,
    fetched_at: new Date().toISOString(),
  });

  return { status: "applied", url: internalUrl, candidate };
}
