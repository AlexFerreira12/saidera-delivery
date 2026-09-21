import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminErrorMessage,
  countProductsInCategory,
  fetchAdminCategories,
  slugify,
  type AdminCategory,
} from "@/lib/admin";
import {
  AdminHeading,
  AdminPage,
  Card,
  Field,
  GhostButton,
  PrimaryButton,
  StateBlock,
  StatusPill,
  inputClass,
} from "@/components/admin/ui";

export const Route = createFileRoute("/admin/categorias")({
  component: AdminCategories,
});

const emptyForm = { name: "", slug: "", icon: "", sort_order: "0" };

function AdminCategories() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const {
    data: categories,
    isLoading,
    error,
  } = useQuery({ queryKey: ["admin", "categories"], queryFn: fetchAdminCategories });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "categories"] });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Informe o nome da categoria.");
      return;
    }
    const { error: err } = await supabase.from("categories").insert({
      name: form.name.trim(),
      slug: slugify(form.slug || form.name),
      icon: form.icon.trim() || null,
      sort_order: Number(form.sort_order || 0),
    });
    if (err) {
      toast.error(adminErrorMessage(err, "Não foi possível criar a categoria."));
      return;
    }
    toast.success("Categoria criada!");
    setForm(emptyForm);
    setCreating(false);
    void refresh();
  };

  const patch = async (id: string, values: Partial<AdminCategory>) => {
    const { error: err } = await supabase.from("categories").update(values).eq("id", id);
    if (err) toast.error(adminErrorMessage(err));
    else void refresh();
  };

  const remove = async (c: AdminCategory) => {
    const linked = await countProductsInCategory(c.id);
    if (linked > 0) {
      toast.error(
        `${linked} produto(s) usam esta categoria. Desative-a em vez de excluir.`,
      );
      return;
    }
    if (!confirm(`Excluir a categoria "${c.name}"?`)) return;
    const { error: err } = await supabase.from("categories").delete().eq("id", c.id);
    if (err) toast.error(adminErrorMessage(err, "Não foi possível excluir."));
    else {
      toast.success("Categoria excluída.");
      void refresh();
    }
  };

  return (
    <AdminPage>
      <AdminHeading
        title="Categorias"
        action={
          <PrimaryButton onClick={() => setCreating((v) => !v)}>
            {creating ? "Fechar" : "Nova"}
          </PrimaryButton>
        }
      />

      {creating && (
        <form onSubmit={create} className="surface-card space-y-3 p-4">
          <Field label="Nome">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Endereço curto (opcional)">
              <input
                className={inputClass}
                placeholder={slugify(form.name) || "cervejas"}
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </Field>
            <Field label="Ordem">
              <input
                className={inputClass}
                inputMode="numeric"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Ícone (emoji ou nome)">
            <input
              className={inputClass}
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
            />
          </Field>
          <PrimaryButton type="submit">CRIAR CATEGORIA</PrimaryButton>
        </form>
      )}

      <StateBlock
        loading={isLoading}
        error={error}
        empty={(categories ?? []).length === 0}
        emptyText="Nenhuma categoria cadastrada."
      />

      <div className="space-y-2">
        {(categories ?? []).map((c) => (
          <Card key={c.id}>
            <div className="flex items-center gap-2">
              <input
                defaultValue={c.name}
                onBlur={(e) =>
                  e.target.value.trim() && e.target.value !== c.name
                    ? patch(c.id, { name: e.target.value.trim() })
                    : undefined
                }
                className={inputClass}
                aria-label={`Nome da categoria ${c.name}`}
              />
              <StatusPill active={c.is_active} onClick={() => patch(c.id, { is_active: !c.is_active })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Endereço">
                <input
                  defaultValue={c.slug}
                  onBlur={(e) =>
                    e.target.value.trim() && e.target.value !== c.slug
                      ? patch(c.id, { slug: slugify(e.target.value) })
                      : undefined
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Ícone">
                <input
                  defaultValue={c.icon ?? ""}
                  onBlur={(e) => patch(c.id, { icon: e.target.value.trim() || null })}
                  className={inputClass}
                />
              </Field>
              <Field label="Ordem">
                <input
                  defaultValue={c.sort_order}
                  inputMode="numeric"
                  onBlur={(e) => patch(c.id, { sort_order: Number(e.target.value || 0) })}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <GhostButton danger onClick={() => remove(c)}>
                Excluir
              </GhostButton>
            </div>
          </Card>
        ))}
      </div>
    </AdminPage>
  );
}
