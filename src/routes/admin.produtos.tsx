import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchCategories, fetchProducts, type Product } from "@/lib/catalog";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/admin/produtos")({
  component: AdminProducts,
});

function AdminProducts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", price: "", stock: "", category_id: "", volume: "" });

  const { data: products } = useQuery({ queryKey: ["admin", "products"], queryFn: () => fetchProducts() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "products"] });

  const patch = async (id: string, values: { stock?: number; price?: number; is_active?: boolean }) => {
    const { error } = await supabase.from("products").update(values).eq("id", id);
    if (error) toast.error("Não foi possível salvar.");
    else void refresh();
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.price) {
      toast.error("Informe nome e preço.");
      return;
    }
    const { error } = await supabase.from("products").insert({
      name: form.name,
      slug: form.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      price: Number(form.price),
      stock: Number(form.stock || 0),
      volume: form.volume || null,
      category_id: form.category_id || null,
    });
    if (error) {
      toast.error("Não foi possível criar o produto.");
      return;
    }
    toast.success("Produto criado!");
    setForm({ name: "", price: "", stock: "", category_id: "", volume: "" });
    setCreating(false);
    void refresh();
  };

  const list = ((products ?? []) as Product[]).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar produto"
          className="flex-1 rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          {creating ? "Fechar" : "Novo"}
        </button>
      </div>

      {creating && (
        <form onSubmit={create} className="surface-card space-y-3 p-4">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nome do produto"
            className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              inputMode="decimal"
              placeholder="Preço"
              className="rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
            />
            <input
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
              inputMode="numeric"
              placeholder="Estoque"
              className="rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
            />
            <input
              value={form.volume}
              onChange={(e) => setForm({ ...form, volume: e.target.value })}
              placeholder="Volume"
              className="rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
            />
          </div>
          <select
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
          >
            <option value="">Categoria</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground">
            CRIAR PRODUTO
          </button>
        </form>
      )}

      <div className="space-y-2">
        {list.map((p) => (
          <div key={p.id} className="surface-card flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {brl(p.price)} · {p.categories?.name ?? "sem categoria"}
                {p.stock <= p.min_stock && <span className="ml-1 font-bold text-destructive">estoque baixo</span>}
              </p>
            </div>
            <input
              type="number"
              defaultValue={p.stock}
              onBlur={(e) => patch(p.id, { stock: Number(e.target.value) })}
              className="w-16 rounded-lg border border-input bg-card px-2 py-1 text-center text-sm outline-none"
              aria-label={`Estoque de ${p.name}`}
            />
            <input
              type="number"
              step="0.01"
              defaultValue={Number(p.price)}
              onBlur={(e) => patch(p.id, { price: Number(e.target.value) })}
              className="w-20 rounded-lg border border-input bg-card px-2 py-1 text-center text-sm outline-none"
              aria-label={`Preço de ${p.name}`}
            />
            <button
              type="button"
              onClick={() => patch(p.id, { is_active: !p.is_active })}
              className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                p.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
              }`}
            >
              {p.is_active ? "Ativo" : "Inativo"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
