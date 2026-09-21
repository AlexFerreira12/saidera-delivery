/**
 * Detecção de tipo de imagem pela assinatura binária (magic bytes).
 * Nome e content-type informados pelo cliente/origem não bastam.
 */

export type SniffedImageType = "jpg" | "png" | "webp";

export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "png";
  if (bytes.length >= 12) {
    const tag =
      String.fromCharCode(...bytes.slice(0, 4)) + String.fromCharCode(...bytes.slice(8, 12));
    if (tag === "RIFFWEBP") return "webp";
  }
  return null;
}

export const IMAGE_MIME_BY_EXT: Record<SniffedImageType, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
