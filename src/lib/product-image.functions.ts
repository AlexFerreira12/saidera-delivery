import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

/**
 * Busca a imagem de um produto pelo GTIN cadastrado (Open Food Facts).
 * Somente administrador; retorna candidato para pré-visualização, sem aplicar.
 */
export const previewProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AdminCtx);
    const { previewProductImageById } = await import("./image-import.server");
    return previewProductImageById(data.productId);
  });

/**
 * Aplica a imagem encontrada: baixa com proteções SSRF, grava cópia no bucket
 * privado e aponta o produto para a imagem interna. Somente administrador.
 * allowReplace=false (padrão do lote) nunca sobrescreve uma imagem existente.
 */
export const applyProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string; allowReplace?: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AdminCtx);
    const { applyProductImageById } = await import("./image-import.server");
    return applyProductImageById(data.productId, data.allowReplace === true);
  });
