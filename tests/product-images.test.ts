import { afterEach, describe, expect, it, vi } from "vitest";
import { sniffImageType } from "@/lib/image-bytes";
import { parseOpenFoodFacts } from "@/lib/image-providers.server";
import { downloadImageGuarded, isAllowedImageUrl, MAX_IMAGE_BYTES } from "@/lib/image-import.server";

const GTIN = "4006381333931";
const IMG = "https://images.openfoodfacts.org/images/products/400/638/133/3931/front.jpg";

function offBody(product: Record<string, unknown> | null) {
  return product
    ? { status: 1, code: GTIN, product: { code: GTIN, ...product } }
    : { status: 0 };
}

describe("parseOpenFoodFacts", () => {
  it("retorna candidato com imagem, nome e marca (fluxo feliz)", () => {
    const result = parseOpenFoodFacts(
      offBody({ product_name: "Lápis Preto", brands: "Marca X", image_front_url: IMG }),
      GTIN,
    );
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.candidate).toMatchObject({
        provider: "open_food_facts",
        gtin: GTIN,
        name: "Lápis Preto",
        brand: "Marca X",
        imageUrl: IMG,
        match: "exact",
      });
    }
  });

  it("usa image_url quando image_front_url não existe", () => {
    const result = parseOpenFoodFacts(offBody({ image_url: IMG }), GTIN);
    expect(result.status).toBe("found");
  });

  it("produto encontrado sem imagem retorna no_image", () => {
    const result = parseOpenFoodFacts(offBody({ product_name: "Sem foto" }), GTIN);
    expect(result.status).toBe("no_image");
  });

  it("produto inexistente retorna not_found", () => {
    expect(parseOpenFoodFacts(offBody(null), GTIN).status).toBe("not_found");
  });

  it("GTIN divergente é rejeitado (nunca inferir por nome)", () => {
    const result = parseOpenFoodFacts(
      { status: 1, code: "999", product: { code: "5449000000996", image_front_url: IMG } },
      GTIN,
    );
    expect(result.status).toBe("gtin_mismatch");
  });

  it("resposta inválida retorna erro", () => {
    expect(parseOpenFoodFacts("lixo", GTIN).status).toBe("error");
    expect(parseOpenFoodFacts(null, GTIN).status).toBe("error");
  });
});

describe("isAllowedImageUrl (proteção SSRF)", () => {
  it("aceita somente HTTPS em hosts do provedor", () => {
    expect(isAllowedImageUrl(IMG)).toBe(true);
    expect(isAllowedImageUrl("https://images.openfoodfacts.net/x.png")).toBe(true);
  });

  it("rejeita http, hosts estranhos e URLs inválidas", () => {
    expect(isAllowedImageUrl("http://images.openfoodfacts.org/x.jpg")).toBe(false);
    expect(isAllowedImageUrl("https://evil.example.com/x.jpg")).toBe(false);
    expect(isAllowedImageUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedImageUrl("não-é-url")).toBe(false);
  });
});

describe("sniffImageType", () => {
  it("reconhece jpeg, png e webp pela assinatura", () => {
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("png");
    const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffImageType(webp)).toBe("webp");
  });

  it("rejeita conteúdo que não é imagem", () => {
    expect(sniffImageType(new TextEncoder().encode("<svg xmlns=...>"))).toBeNull();
    expect(sniffImageType(Uint8Array.from([1, 2, 3]))).toBeNull();
  });
});

describe("downloadImageGuarded", () => {
  afterEach(() => vi.unstubAllGlobals());

  function fakeResponse(init: {
    ok?: boolean;
    status?: number;
    contentType?: string;
    contentLength?: number;
    body?: Uint8Array;
    url?: string;
  }) {
    const headers = new Headers();
    if (init.contentType) headers.set("content-type", init.contentType);
    if (init.contentLength != null) headers.set("content-length", String(init.contentLength));
    const body = init.body ?? Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    return {
      ok: init.ok ?? true,
      url: init.url ?? IMG,
      headers,
      arrayBuffer: () => Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)),
    } as unknown as Response;
  }

  it("baixa imagem válida do host permitido", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fakeResponse({ contentType: "image/jpeg" }))));
    const img = await downloadImageGuarded(IMG);
    expect(img.ext).toBe("jpg");
    expect(img.contentType).toBe("image/jpeg");
    expect(img.bytes.byteLength).toBeGreaterThan(0);
  });

  it("rejeita host fora da allowlist sem nem chamar fetch", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(downloadImageGuarded("https://evil.example.com/x.jpg")).rejects.toThrow(
      "URL_NAO_PERMITIDA",
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejeita redirect para host fora da allowlist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(fakeResponse({ contentType: "image/jpeg", url: "https://evil.example.com/x.jpg" })),
      ),
    );
    await expect(downloadImageGuarded(IMG)).rejects.toThrow("DOWNLOAD_FALHOU");
  });

  it("rejeita MIME que não é imagem permitida", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fakeResponse({ contentType: "image/svg+xml" }))));
    await expect(downloadImageGuarded(IMG)).rejects.toThrow("MIME_INVALIDO");
  });

  it("rejeita arquivo acima do limite pelo content-length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(fakeResponse({ contentType: "image/jpeg", contentLength: MAX_IMAGE_BYTES + 1 })),
      ),
    );
    await expect(downloadImageGuarded(IMG)).rejects.toThrow("ARQUIVO_GRANDE");
  });

  it("rejeita corpo acima do limite mesmo sem content-length", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big[0] = 0xff;
    big[1] = 0xd8;
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fakeResponse({ contentType: "image/jpeg", body: big }))));
    await expect(downloadImageGuarded(IMG)).rejects.toThrow("ARQUIVO_GRANDE");
  });

  it("rejeita quando a assinatura binária não bate com imagem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(fakeResponse({ contentType: "image/jpeg", body: new TextEncoder().encode("html") })),
      ),
    );
    await expect(downloadImageGuarded(IMG)).rejects.toThrow("TIPO_INVALIDO");
  });

  it("timeout/erro de rede vira DOWNLOAD_FALHOU", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new DOMException("aborted", "AbortError"))));
    await expect(downloadImageGuarded(IMG)).rejects.toThrow("DOWNLOAD_FALHOU");
  });

  it("resposta HTTP de erro vira DOWNLOAD_FALHOU", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fakeResponse({ ok: false, status: 500 }))));
    await expect(downloadImageGuarded(IMG)).rejects.toThrow("DOWNLOAD_FALHOU");
  });
});
