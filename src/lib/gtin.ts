/**
 * Validação de GTIN/EAN/UPC (client-safe, sem dependências).
 * Aceita EAN-8, UPC-A (GTIN-12), EAN-13 e GTIN-14, com dígito verificador.
 */

export type GtinKind = "EAN-8" | "UPC-A" | "EAN-13" | "GTIN-14";

export function normalizeGtin(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

export function gtinKind(digits: string): GtinKind | null {
  if (/^\d{8}$/.test(digits)) return "EAN-8";
  if (/^\d{12}$/.test(digits)) return "UPC-A";
  if (/^\d{13}$/.test(digits)) return "EAN-13";
  if (/^\d{14}$/.test(digits)) return "GTIN-14";
  return null;
}

/** Dígito verificador GS1: da direita para a esquerda (sem o dígito), pesos 3,1,3,1… */
function checkDigitOk(digits: string): boolean {
  const nums = digits.split("").map(Number);
  const check = nums.pop() ?? -1;
  let sum = 0;
  for (let i = nums.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += (nums[i] ?? 0) * w;
  }
  return (10 - (sum % 10)) % 10 === check;
}

export function isValidGtin(raw: string | null | undefined): boolean {
  const digits = normalizeGtin(raw);
  if (!gtinKind(digits)) return false;
  return checkDigitOk(digits);
}

/**
 * Compara dois GTINs de forma exata, tolerando apenas zeros à esquerda
 * (GTIN-14 de um EAN-13 é o mesmo código com um 0 na frente).
 */
export function gtinsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = normalizeGtin(a).replace(/^0+/, "");
  const db = normalizeGtin(b).replace(/^0+/, "");
  return da !== "" && da === db;
}
