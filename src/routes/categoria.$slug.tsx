import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/AppShell";
import { fetchCategories, fetchProducts } from "@/lib/catalog";
import { ProductGrid } from "@/routes/index";

export const Route = createFileRoute("/categoria/$slug")({
  head: ({ params }) => {
    const nice = params.slug.replace(/-/g, " ");
    return {
      meta: [
        { title: `${nice} — Bebidas Guariba` },
        {
          name: "description",
          content: `Produtos da categoria ${nice} com entrega rápida em Guariba/SP.`,
        },
        { property: "og:title", content: `${nice} — Bebidas Guariba` },
        {
          property: "og:description",
          content: `Compre ${nice} com preço de distribuidora em Guariba/SP.`,
        },
      ],
    };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data, isLoading } = useQuery({
    queryKey: ["products", slug],
    queryFn: () => fetchProducts({ categorySlug: slug }),
  });
  const category = (categories ?? []).find((c) => c.slug === slug);

  return (
    <AppShell>
      <PageHeader title={category?.name ?? "Categoria"} backTo="/categorias" />
      <div className="p-4">
        <ProductGrid
          products={data ?? []}
          loading={isLoading}
          empty="Ainda não temos produtos nesta categoria."
        />
      </div>
    </AppShell>
  );
}
