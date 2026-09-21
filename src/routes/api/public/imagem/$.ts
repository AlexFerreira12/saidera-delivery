import { createFileRoute } from "@tanstack/react-router";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Serve as imagens do catálogo (leitura pública, somente arquivos válidos do depósito). */
export const Route = createFileRoute("/api/public/imagem/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = String((params as { _splat?: string })._splat ?? "");
        const match = /^(produtos|banners)\/[A-Za-z0-9-]+\.(jpg|png|webp)$/.exec(path);
        if (!match) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("catalogo").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });

        return new Response(await data.arrayBuffer(), {
          headers: {
            "content-type": TYPES[match[2] as string] ?? "application/octet-stream",
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
