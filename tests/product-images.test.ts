import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sniffImageType } from "@/lib/image-bytes";
import {
  __resetUpcItemdbPacerForTests,
  buildOfficialFallbackUrls,
  isPublicHttpsImageUrl,
  lookupProductImageByGtin,
  lookupUpcItemdb,
  parseOpenFoodFacts,
  parseRetryAfter,
  parseUpcItemdb,
} from "@/lib/image-providers.server";
import {
  downloadFirstReachableImage,
  downloadImageGuarded,
  isAllowedImageUrl,
  MAX_IMAGE_BYTES,
} from "@/lib/image-import.server";

const GTIN = "4006381333931";
const IMG = "https://images.openfoodfacts.org/images/products/400/638/133/3931/front.jpg";

function offBody(product: Record<string, unknown> | null) {
  return product ? { status: 1, code: GTIN, product: { code: GTIN, ...product } } : { status: 0 };
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

  it("inclui espelho oficial e foto original (imgid) como fallback", () => {
    const result = parseOpenFoodFacts(
      offBody({
        image_front_url: IMG,
        images: { front_pt: { imgid: 10, rev: 60 }, "1": { uploaded_t: 1 } },
      }),
      GTIN,
    );
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.candidate.fallbackImageUrls).toEqual([
        "https://images.openfoodfacts.net/images/products/400/638/133/3931/front.jpg",
        "https://images.openfoodfacts.net/images/products/400/638/133/3931/10.400.jpg",
        "https://images.openfoodfacts.net/images/products/400/638/133/3931/10.jpg",
      ]);
    }
  });
});

describe("buildOfficialFallbackUrls", () => {
  const base = "https://images.openfoodfacts.org/images/products/400/638/133/3931/front.jpg";

  it("gera apenas URLs de domínios oficiais do provedor", () => {
    const urls = buildOfficialFallbackUrls(base, {}) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(isAllowedImageUrl(url)).toBe(true);
      expect(url.startsWith("https://images.openfoodfacts.")).toBe(true);
    }
  });

  it("sem imgid, oferece somente o mesmo caminho no espelho", () => {
    expect(buildOfficialFallbackUrls(base, {})).toEqual([
      "https://images.openfoodfacts.net/images/products/400/638/133/3931/front.jpg",
    ]);
  });

  it("retorna undefined para URL fora do host primário oficial", () => {
    expect(buildOfficialFallbackUrls("https://evil.example.com/x.jpg", {})).toBeUndefined();
    expect(buildOfficialFallbackUrls(null, {})).toBeUndefined();
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
      arrayBuffer: () =>
        Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)),
    } as unknown as Response;
  }

  it("baixa imagem válida do host permitido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(fakeResponse({ contentType: "image/jpeg" }))),
    );
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
        Promise.resolve(
          fakeResponse({ contentType: "image/jpeg", url: "https://evil.example.com/x.jpg" }),
        ),
      ),
    );
    await expect(downloadImageGuarded(IMG)).rejects.toThrow("DOWNLOAD_FALHOU");
  });

  it("rejeita MIME que não é imagem permitida", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(fakeResponse({ contentType: "image/svg+xml" }))),
    );
    await expect(downloadImageGuarded(IMG)).rejects.toThrow("MIME_INVALIDO");
  });

  it("rejeita arquivo acima do limite pelo content-length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse({ contentType: "image/jpeg", contentLength: MAX_IMAGE_BYTES + 1 }),
        ),
      ),
    );
    await expect(downloadImageGuarded(IMG)).rejects.toThrow("ARQUIVO_GRANDE");
  });

  it("rejeita corpo acima do limite mesmo sem content-length", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big[0] = 0xff;
    big[1] = 0xd8;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(fakeResponse({ contentType: "image/jpeg", body: big }))),
    );
    await expect(downloadImageGuarded(IMG)).rejects.toThrow("ARQUIVO_GRANDE");
  });

  it("rejeita quando a assinatura binária não bate com imagem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse({ contentType: "image/jpeg", body: new TextEncoder().encode("html") }),
        ),
      ),
    );
    await expect(downloadImageGuarded(IMG)).rejects.toThrow("TIPO_INVALIDO");
  });

  it("timeout/erro de rede vira PROVEDOR_IMAGEM_INALCANCAVEL (provider_image_unreachable)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new DOMException("aborted", "AbortError"))),
    );
    await expect(downloadImageGuarded(IMG)).rejects.toThrow("PROVEDOR_IMAGEM_INALCANCAVEL");
  });

  it("resposta HTTP de erro vira DOWNLOAD_FALHOU", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(fakeResponse({ ok: false, status: 500 }))),
    );
    await expect(downloadImageGuarded(IMG)).rejects.toThrow("DOWNLOAD_FALHOU");
  });
});

describe("downloadFirstReachableImage (cadeia de fallback oficial)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const MIRROR = "https://images.openfoodfacts.net/images/products/400/638/133/3931/front.jpg";
  const RAW = "https://images.openfoodfacts.net/images/products/400/638/133/3931/10.jpg";
  const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

  function okResponse() {
    const headers = new Headers({ "content-type": "image/jpeg" });
    return {
      ok: true,
      url: MIRROR,
      headers,
      arrayBuffer: () => Promise.resolve(JPEG.buffer.slice(0)),
    } as unknown as Response;
  }

  it("usa a URL primária quando ela funciona, sem chamar os fallbacks", async () => {
    const spy = vi.fn(() => Promise.resolve(okResponse()));
    vi.stubGlobal("fetch", spy);
    const img = await downloadFirstReachableImage([IMG, MIRROR, RAW]);
    expect(img.ext).toBe("jpg");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("cai para o espelho oficial quando a primária está inalcançável", async () => {
    const spy = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://images.openfoodfacts.org/")) {
        return Promise.reject(new DOMException("timeout", "AbortError"));
      }
      return Promise.resolve(okResponse());
    });
    vi.stubGlobal("fetch", spy);
    const img = await downloadFirstReachableImage([IMG, MIRROR, RAW]);
    expect(img.ext).toBe("jpg");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("relata PROVEDOR_IMAGEM_INALCANCAVEL quando todas as URLs falham por rede/HTTP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("https://images.openfoodfacts.org/")) {
          return Promise.reject(new DOMException("timeout", "AbortError"));
        }
        const headers = new Headers({ "content-type": "image/jpeg" });
        return Promise.resolve({
          ok: false,
          url,
          headers,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        } as unknown as Response);
      }),
    );
    await expect(downloadFirstReachableImage([IMG, MIRROR, RAW])).rejects.toThrow(
      "PROVEDOR_IMAGEM_INALCANCAVEL",
    );
  });

  it("erro de validação aborta a cadeia sem tentar fallbacks", async () => {
    const spy = vi.fn(() =>
      Promise.resolve({
        ok: true,
        url: IMG,
        headers: new Headers({ "content-type": "image/svg+xml" }),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode("<svg/>").buffer),
      } as unknown as Response),
    );
    vi.stubGlobal("fetch", spy);
    await expect(downloadFirstReachableImage([IMG, MIRROR])).rejects.toThrow("MIME_INVALIDO");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// UPCitemdb (provedor principal)
// ---------------------------------------------------------------------------

const UPC_GTIN = "0049000028911"; // EAN-13 (zero à esquerda) do UPC 049000028911
const UPC_IMG = "https://i5.walmartimages.com/asr/abc.jpeg";
const UPC_API_URL = "https://api.upcitemdb.com/prod/trial/lookup";

function upcBody(items: Record<string, unknown>[] | null) {
  return items === null
    ? { code: "OK", total: 0, offset: 0, items: [] }
    : { code: "OK", total: items.length, offset: 0, items };
}

describe("isPublicHttpsImageUrl (política de URL do UPCitemdb)", () => {
  it("aceita HTTPS público de CDNs de varejo", () => {
    expect(isPublicHttpsImageUrl(UPC_IMG)).toBe(true);
    expect(isPublicHttpsImageUrl("https://target.scene7.com/is/image/Target/x?wid=1000")).toBe(
      true,
    );
    expect(isPublicHttpsImageUrl("https://images.openfoodfacts.org/x.jpg")).toBe(true);
  });

  it("rejeita esquema não HTTPS", () => {
    expect(isPublicHttpsImageUrl("http://ct.mywebgrocer.com/legacy/x.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("ftp://example.com/x.jpg")).toBe(false);
  });

  it("rejeita localhost e nomes internos", () => {
    expect(isPublicHttpsImageUrl("https://localhost/x.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("https://api.localhost/x.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("https://app.internal/x.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("https://server.local/x.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("https://intranet/x.jpg")).toBe(false);
  });

  it("rejeita IP literal — privado, link-local e público", () => {
    expect(isPublicHttpsImageUrl("https://192.168.1.1/x.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isPublicHttpsImageUrl("https://10.0.0.5/x.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("https://8.8.8.8/x.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("https://[::1]/x.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("https://[2001:db8::1]/x.jpg")).toBe(false);
  });

  it("rejeita notações alternativas de IP, userinfo e porta fora de 443", () => {
    expect(isPublicHttpsImageUrl("https://2130706433/x.jpg")).toBe(false); // 127.0.0.1 decimal
    expect(isPublicHttpsImageUrl("https://0x7f000001/x.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("https://user:pass@example.com/x.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("https://example.com:8443/x.jpg")).toBe(false);
    expect(isPublicHttpsImageUrl("https://example.com:443/x.jpg")).toBe(true);
  });

  it("rejeita URLs inválidas", () => {
    expect(isPublicHttpsImageUrl("não-é-url")).toBe(false);
    expect(isPublicHttpsImageUrl("")).toBe(false);
  });
});

describe("parseUpcItemdb", () => {
  const item = {
    upc: "049000028911",
    ean: "0049000028911",
    title: "Diet Coke Soda Soft Drink, 12 fl oz, 12 Pack",
    brand: "Diet Coke",
    images: [
      "http://ct.mywebgrocer.com/legacy/x.jpg", // HTTP: descartada
      UPC_IMG,
      "https://target.scene7.com/is/image/Target/x",
      "https://192.168.0.1/x.jpg", // IP literal: descartada
    ],
  };

  it("retorna candidato com imagem filtrada (só HTTPS público), nome e marca", () => {
    const result = parseUpcItemdb(upcBody([item]), UPC_GTIN);
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.candidate).toMatchObject({
        provider: "upcitemdb",
        gtin: UPC_GTIN,
        name: "Diet Coke Soda Soft Drink, 12 fl oz, 12 Pack",
        brand: "Diet Coke",
        imageUrl: UPC_IMG,
        match: "exact",
      });
      expect(result.candidate.fallbackImageUrls).toEqual([
        "https://target.scene7.com/is/image/Target/x",
      ]);
    }
  });

  it("casa por UPC-A quando o item não tem ean", () => {
    const result = parseUpcItemdb(
      upcBody([{ upc: "049000028911", title: "X", images: [UPC_IMG] }]),
      UPC_GTIN,
    );
    expect(result.status).toBe("found");
  });

  it("lista vazia retorna not_found", () => {
    expect(parseUpcItemdb(upcBody(null), UPC_GTIN).status).toBe("not_found");
  });

  it("item com GTIN divergente é rejeitado (nunca inferir por nome)", () => {
    const result = parseUpcItemdb(
      upcBody([
        { upc: "123456789012", ean: "0123456789012", title: "Diet Coke", images: [UPC_IMG] },
      ]),
      UPC_GTIN,
    );
    expect(result.status).toBe("gtin_mismatch");
  });

  it("item sem imagem utilizável retorna no_image", () => {
    const result = parseUpcItemdb(
      upcBody([{ ean: UPC_GTIN, title: "X", images: ["http://inseguro.example.com/x.jpg"] }]),
      UPC_GTIN,
    );
    expect(result.status).toBe("no_image");
  });

  it("resposta inválida ou code diferente de OK retorna erro", () => {
    expect(parseUpcItemdb("lixo", UPC_GTIN).status).toBe("error");
    expect(parseUpcItemdb({ code: "INVALID_UPC" }, UPC_GTIN).status).toBe("error");
  });
});

describe("parseRetryAfter", () => {
  it("interpreta segundos", () => {
    expect(parseRetryAfter("5")).toBe(5);
    expect(parseRetryAfter("0")).toBe(0);
  });

  it("interpreta HTTP-date futura", () => {
    const date = new Date(Date.now() + 3_000).toUTCString();
    const value = parseRetryAfter(date);
    expect(value).toBeGreaterThanOrEqual(2);
    expect(value).toBeLessThanOrEqual(4);
  });

  it("retorna null para ausente ou inválido", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("abc")).toBeNull();
    expect(parseRetryAfter("-3")).toBeNull();
  });
});

describe("lookupUpcItemdb (rate limit e erros)", () => {
  beforeEach(() => __resetUpcItemdbPacerForTests());
  afterEach(() => vi.unstubAllGlobals());

  function upcResponse(init: { status?: number; retryAfter?: string; body?: unknown }) {
    const status = init.status ?? 200;
    const headers = new Headers();
    if (init.retryAfter) headers.set("retry-after", init.retryAfter);
    return {
      status,
      ok: status >= 200 && status < 300,
      headers,
      json: () => Promise.resolve(init.body),
    } as unknown as Response;
  }

  it("429 com Retry-After curto aguarda e tenta uma vez", async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce(upcResponse({ status: 429, retryAfter: "0" }))
      .mockResolvedValueOnce(
        upcResponse({ body: upcBody([{ upc: "049000028911", title: "X", images: [UPC_IMG] }]) }),
      );
    vi.stubGlobal("fetch", spy);
    const result = await lookupUpcItemdb(UPC_GTIN);
    expect(result.status).toBe("found");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("429 com Retry-After longo vira rate_limited sem nova tentativa", async () => {
    const spy = vi.fn(() => Promise.resolve(upcResponse({ status: 429, retryAfter: "120" })));
    vi.stubGlobal("fetch", spy);
    await expect(lookupUpcItemdb(UPC_GTIN)).resolves.toMatchObject({ status: "rate_limited" });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("429 persistente após a nova tentativa vira rate_limited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(upcResponse({ status: 429, retryAfter: "0" }))),
    );
    await expect(lookupUpcItemdb(UPC_GTIN)).resolves.toMatchObject({ status: "rate_limited" });
  });

  it("erro de rede vira PROVEDOR_INDISPONIVEL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("socket"))),
    );
    await expect(lookupUpcItemdb(UPC_GTIN)).resolves.toMatchObject({
      status: "error",
      message: "PROVEDOR_INDISPONIVEL",
    });
  });
});

describe("lookupProductImageByGtin (cadeia UPCitemdb → Open Food Facts)", () => {
  beforeEach(() => __resetUpcItemdbPacerForTests());
  afterEach(() => vi.unstubAllGlobals());

  function stubProviders(upc: unknown, off: unknown) {
    return vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.startsWith(UPC_API_URL) ? upc : off;
      return Promise.resolve({
        status: 200,
        ok: true,
        headers: new Headers(),
        json: () => Promise.resolve(body),
      } as unknown as Response);
    });
  }

  it("usa o UPCitemdb quando ele encontra imagem, sem chamar o OFF", async () => {
    const spy = stubProviders(
      upcBody([{ upc: "049000028911", title: "Diet Coke", images: [UPC_IMG] }]),
      offBody({ product_name: "OFF", image_front_url: IMG }),
    );
    vi.stubGlobal("fetch", spy);
    const result = await lookupProductImageByGtin(UPC_GTIN);
    expect(result.status).toBe("found");
    if (result.status === "found") expect(result.candidate.provider).toBe("upcitemdb");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("cai para o Open Food Facts quando o UPCitemdb não encontra", async () => {
    vi.stubGlobal("fetch", stubProviders(upcBody(null), offBody({ image_front_url: IMG })));
    const result = await lookupProductImageByGtin(GTIN);
    expect(result.status).toBe("found");
    if (result.status === "found") expect(result.candidate.provider).toBe("open_food_facts");
  });

  it("cai para o OFF quando o UPCitemdb encontrou o produto mas sem imagem utilizável", async () => {
    vi.stubGlobal(
      "fetch",
      stubProviders(
        upcBody([{ ean: GTIN, title: "Sem imagem", images: [] }]),
        offBody({ image_front_url: IMG }),
      ),
    );
    const result = await lookupProductImageByGtin(GTIN);
    expect(result.status).toBe("found");
    if (result.status === "found") expect(result.candidate.provider).toBe("open_food_facts");
  });

  it("limite do UPCitemdb não bloqueia o fallback OFF", async () => {
    const spy = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(UPC_API_URL)) {
        return Promise.resolve({
          status: 429,
          ok: false,
          headers: new Headers({ "retry-after": "120" }),
          json: () => Promise.resolve({}),
        } as unknown as Response);
      }
      return Promise.resolve({
        status: 200,
        ok: true,
        headers: new Headers(),
        json: () => Promise.resolve(offBody({ image_front_url: IMG })),
      } as unknown as Response);
    });
    vi.stubGlobal("fetch", spy);
    const result = await lookupProductImageByGtin(GTIN);
    expect(result.status).toBe("found");
    if (result.status === "found") expect(result.candidate.provider).toBe("open_food_facts");
  });

  it("produto sem imagem no UPC e ausente no OFF relata no_image com o candidato UPC", async () => {
    vi.stubGlobal(
      "fetch",
      stubProviders(upcBody([{ ean: GTIN, title: "Sem imagem", images: [] }]), offBody(null)),
    );
    const result = await lookupProductImageByGtin(GTIN);
    expect(result.status).toBe("no_image");
    if (result.status === "no_image") expect(result.candidate.provider).toBe("upcitemdb");
  });

  it("não encontrado em nenhum provedor relata not_found", async () => {
    vi.stubGlobal("fetch", stubProviders(upcBody(null), offBody(null)));
    await expect(lookupProductImageByGtin(GTIN)).resolves.toMatchObject({ status: "not_found" });
  });
});
