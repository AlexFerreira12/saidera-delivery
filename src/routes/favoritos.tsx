import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProductGrid } from "@/routes/index";
import type { Product } from "@/lib/catalog";

export const Route = createFileRoute("/favoritos")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Favoritos — Bebidas Guariba" },
      {
        name: "description",
        content: "Suas bebidas favoritas salvas para pedir em poucos toques.",
      },
      { property: "og:title", content: "Favoritos — Bebidas Guariba" },
      { property: "og:description", content: "Seus produtos favoritos em um só lugar." },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const { data: products } = useQuery({
    queryKey: ["favorites"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select("products(*, categories(name, slug), promotions(min_quantity, unit_price, label))");
      if (error) throw error;
      return (data ?? []).map((row) => row.products).filter(Boolean) as unknown as Product[];
    },
  });

  return (
    <AppShell>
      <PageHeader title="Favoritos" />
      <div className="p-4">
        {products && products.length > 0 ? (
          <ProductGrid products={products} />
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Você ainda não favoritou nenhum produto.
          </p>
        )}
      </div>
    </AppShell>
  );
}
