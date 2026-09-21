import { describe, expect, it } from "vitest";
import { gtinKind, gtinsMatch, isValidGtin, normalizeGtin } from "@/lib/gtin";

describe("normalizeGtin", () => {
  it("remove tudo que não é dígito", () => {
    expect(normalizeGtin("789 1000.315-507")).toBe("7891000315507");
    expect(normalizeGtin(null)).toBe("");
    expect(normalizeGtin(undefined)).toBe("");
  });
});

describe("isValidGtin", () => {
  it("aceita EAN-13 válido", () => {
    expect(isValidGtin("4006381333931")).toBe(true);
    expect(isValidGtin("5449000000996")).toBe(true);
  });

  it("aceita EAN-8 válido", () => {
    expect(isValidGtin("96385074")).toBe(true);
  });

  it("aceita UPC-A (GTIN-12) válido", () => {
    expect(isValidGtin("036000291452")).toBe(true);
  });

  it("aceita GTIN-14 válido", () => {
    expect(isValidGtin("10614141000415")).toBe(true);
  });

  it("rejeita dígito verificador errado", () => {
    expect(isValidGtin("4006381333932")).toBe(false);
    expect(isValidGtin("96385071")).toBe(false);
  });

  it("rejeita tamanhos fora do padrão", () => {
    expect(isValidGtin("12345")).toBe(false);
    expect(isValidGtin("123456789")).toBe(false);
    expect(isValidGtin("12345678901")).toBe(false);
    expect(isValidGtin("")).toBe(false);
    expect(isValidGtin(null)).toBe(false);
  });

  it("classifica o tipo pelo tamanho", () => {
    expect(gtinKind("96385074")).toBe("EAN-8");
    expect(gtinKind("036000291452")).toBe("UPC-A");
    expect(gtinKind("4006381333931")).toBe("EAN-13");
    expect(gtinKind("10614141000415")).toBe("GTIN-14");
    expect(gtinKind("123")).toBeNull();
  });
});

describe("gtinsMatch", () => {
  it("compara exato, tolerando zeros à esquerda", () => {
    expect(gtinsMatch("04006381333931", "4006381333931")).toBe(true);
    expect(gtinsMatch("4006381333931", "4006381333931")).toBe(true);
  });

  it("rejeita códigos divergentes", () => {
    expect(gtinsMatch("4006381333931", "5449000000996")).toBe(false);
    expect(gtinsMatch("", "4006381333931")).toBe(false);
    expect(gtinsMatch(null, null)).toBe(false);
  });
});
