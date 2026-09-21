import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "catalogo";
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type AdminCtx = {
  userId: string;
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "admin" },
    ) => Promise<{ data: unknown; error: unknown }>;
  };
};

async function assertAdmin(context: AdminCtx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("SEM_PERMISSAO");
}

/** Envia uma imagem do catálogo. Só administrador; tipo e tamanho validados no servidor. */
export const uploadCatalogImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { folder: "produtos" | "banners"; contentType: string; dataBase64: string }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AdminCtx);

    const ext = ALLOWED[data.contentType];
    if (!ext) throw new Error("TIPO_INVALIDO");
    if (data.folder !== "produtos" && data.folder !== "banners") throw new Error("PASTA_INVALIDA");

    const binary = Uint8Array.from(atob(data.dataBase64), (c) => c.charCodeAt(0));
    if (binary.byteLength === 0) throw new Error("ARQUIVO_VAZIO");
    if (binary.byteLength > MAX_BYTES) throw new Error("ARQUIVO_GRANDE");
    if (!hasImageSignature(binary, ext)) throw new Error("TIPO_INVALIDO");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${data.folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, binary, { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message);

    return { path, url: `/api/public/imagem/${path}` };
  });

/** Remove uma imagem enviada por nós (endereços externos são ignorados). */
export const deleteCatalogImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AdminCtx);
    const prefix = "/api/public/imagem/";
    if (!data.url.startsWith(prefix)) return { removed: false };
    const path = data.url.slice(prefix.length);
    if (!/^(produtos|banners)\/[A-Za-z0-9-]+\.(jpg|png|webp)$/.test(path))
      return { removed: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from(BUCKET).remove([path]);
    return { removed: true };
  });

/** Confere a assinatura binária do arquivo — nome e content-type do cliente não bastam. */
function hasImageSignature(bytes: Uint8Array, ext: string) {
  if (ext === "jpg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (ext === "png")
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (ext === "webp") {
    const tag =
      String.fromCharCode(...bytes.slice(0, 4)) + String.fromCharCode(...bytes.slice(8, 12));
    return tag === "RIFFWEBP";
  }
  return false;
}
