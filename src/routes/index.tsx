import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin, Search, ShoppingBag, User, Clock, Store, ArrowDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProductCard } from "@/components/ProductCard";
import {
  fetchBanners,
  fetchCategories,
  fetchProducts,
  fetchStoreSettings,
  type Product,
} from "@/lib/catalog";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SAIDERA — Adega e Distribuidora | Entrega rápida em Guariba/SP" },
      {
        name: "description",
        content:
          "SAIDERA Adega e Distribuidora: bebidas geladas, gelo, carvão e petiscos com entrega rápida em Guariba/SP. Preço de distribuidora e pagamento pelo app.",
      },
      { property: "og:title", content: "SAIDERA — Adega e Distribuidora" },
      {
        property: "og:description",
        content: "Bebidas geladas, gelo, carvão e petiscos entregues em minutos em Guariba/SP.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const cart = useCart();
  const [search, setSearch] = useState("");

  const { data: store } = useQuery({ queryKey: ["store"], queryFn: fetchStoreSettings });
  const { data: banners } = useQuery({ queryKey: ["banners"], queryFn: fetchBanners });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchProducts(),
  });

  const { data: address } = useQuery({
    queryKey: ["default-address", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("addresses")
        .select("*")
        .eq("user_id", user!.id)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: repeatIds } = useQuery({
    queryKey: ["repeat-products", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("id")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      const ids = (orders ?? []).map((o) => o.id);
      if (!ids.length) return [] as string[];
      const { data: items } = await supabase
        .from("order_items")
        .select("product_id")
        .in("order_id", ids);
      return [...new Set((items ?? []).map((i) => i.product_id).filter(Boolean))] as string[];
    },
  });

  const list = (products ?? []) as Product[];
  const filtered = search
    ? list.filter((p) => `${p.name} ${p.brand ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    : list;
  const featured = list.filter((p) => p.is_featured);
  const repeat = list.filter((p) => (repeatIds ?? []).includes(p.id));

  const isOpen = store?.is_open !== false;

  return (
    <AppShell>
      <header className="brand-gradient safe-top px-4 pb-5 pt-5 text-primary-foreground">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {/* Wordmark temporário em sans — substituir pelo logo oficial quando o asset existir. */}
            <p className="text-xl font-extrabold tracking-[0.22em] text-accent">SAIDERA</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-primary-foreground/55">
              Adega e Distribuidora
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: user ? "/enderecos" : "/auth" })}
              className="mt-2 flex max-w-[220px] items-center gap-1 text-xs text-primary-foreground/70"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="truncate">
                {address ? `${address.street}, ${address.number}` : "Escolher endereço de entrega"}
              </span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/conta"
              aria-label="Minha conta"
              className="grid h-10 w-10 place-items-center rounded-full border border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground"
            >
              <User className="h-5 w-5" />
            </Link>
            <Link
              to="/carrinho"
              aria-label="Carrinho"
              className="relative grid h-10 w-10 place-items-center rounded-full border border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground"
            >
              <ShoppingBag className="h-5 w-5" />
              {cart.count > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                  {cart.count}
                </span>
              )}
            </Link>
          </div>
        </div>

        <div className="shadow-card mt-4 flex h-12 items-center gap-2 rounded-xl bg-card px-4 text-foreground">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produtos"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </header>

      {!search && (
        <section className="px-4 pt-4">
          <div className="brand-gradient relative overflow-hidden rounded-2xl p-5 text-primary-foreground">
            <div className="h-px w-10 bg-accent" aria-hidden />
            <h1 className="mt-3 text-xl font-extrabold leading-snug tracking-tight">
              Bebidas selecionadas, entrega rápida.
            </h1>
            <p className="mt-1.5 max-w-[260px] text-xs leading-relaxed text-primary-foreground/65">
              Adega completa com preço de distribuidora, entregue gelada na sua porta.
            </p>
            <a
              href="#catalogo"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90"
            >
              Explorar produtos
              <ArrowDown className="h-4 w-4" />
            </a>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-medium">
            <span
              className={`inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 ${
                isOpen ? "border-success/40 text-success" : "border-warning/40 text-warning"
              }`}
            >
              <Store className="h-3.5 w-3.5" />
              {isOpen ? "Loja aberta" : "Loja fechada"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> {store?.avg_delivery_minutes ?? 35} min
            </span>
          </div>
        </section>
      )}

      {!isOpen && (
        <p className="mx-4 mt-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs font-medium text-warning">
          Estamos fechados no momento. Horário de funcionamento:{" "}
          {store?.opening_hours ?? "consulte a loja"}. Você pode montar seu carrinho e finalizar
          quando abrirmos.
        </p>
      )}

      {search ? (
        <Section title={`Resultados para "${search}"`}>
          <ProductGrid products={filtered} loading={false} empty="Nenhum produto encontrado." />
        </Section>
      ) : (
        <>
          {(banners ?? []).length > 0 && (
            <div className="no-scrollbar mt-5 flex gap-3 overflow-x-auto px-4 pb-1">
              {(banners ?? []).map((b) => (
                <div
                  key={b.id}
                  className="brand-gradient min-w-[80%] rounded-2xl p-4 text-primary-foreground"
                >
                  <p className="text-base font-extrabold text-accent">{b.title}</p>
                  <p className="mt-1 text-xs text-primary-foreground/60">{b.subtitle}</p>
                </div>
              ))}
            </div>
          )}

          <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto px-4">
            {(categories ?? []).map((c) => (
              <Link
                key={c.id}
                to="/categoria/$slug"
                params={{ slug: c.slug }}
                className="shadow-card whitespace-nowrap rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-accent/70"
              >
                {c.name}
              </Link>
            ))}
          </div>

          <div id="catalogo" className="scroll-mt-4">
            {repeat.length > 0 && (
              <Section title="Comprar novamente">
                <ProductGrid products={repeat} loading={false} />
              </Section>
            )}

            {featured.length > 0 && (
              <Section title="Ofertas do dia">
                <ProductGrid products={featured} loading={isLoading} />
              </Section>
            )}

            <Section title="Todos os produtos">
              <ProductGrid
                products={list}
                loading={isLoading}
                empty="Nenhum produto cadastrado ainda."
              />
            </Section>
          </div>
        </>
      )}
      <p className="px-4 pb-4 pt-2 text-center text-[11px] text-muted-foreground">
        Olá{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}! SAIDERA — Adega e
        Distribuidora · Entregamos em Guariba/SP.
      </p>
    </AppShell>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 px-4">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="h-3.5 w-0.5 rounded-full bg-accent" aria-hidden />
        <h2 className="text-base font-extrabold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function ProductGrid({
  products,
  loading,
  empty = "Nada por aqui.",
}: {
  products: Product[];
  loading?: boolean;
  empty?: string;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (!products.length)
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="grid grid-cols-2 gap-3">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
