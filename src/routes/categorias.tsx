import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/AppShell";
import { fetchCategories } from "@/lib/catalog";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/categorias")({
  head: () => ({
    meta: [
      { title: "Categorias — Bebidas Guariba" },
      {
        name: "description",
        content: "Navegue por refrigerantes, energéticos, água, gelo, carvão, petiscos e combos.",
      },
      { property: "og:title", content: "Categorias — Bebidas Guariba" },
      {
        property: "og:description",
        content: "Todas as categorias da distribuidora em Guariba/SP.",
      },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  return (
    <AppShell>
      <PageHeader title="Categorias" />
      <div className="grid grid-cols-2 gap-3 p-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))
          : (data ?? []).map((c) => (
              <Link
                key={c.id}
                to="/categoria/$slug"
                params={{ slug: c.slug }}
                className="surface-card flex h-24 items-end p-4 font-display text-base font-bold"
              >
                {c.name}
              </Link>
            ))}
      </div>
    </AppShell>
  );
}
