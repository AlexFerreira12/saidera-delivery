import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminErrorMessage, fetchAdminBanners, type AdminBanner } from "@/lib/admin";
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
import { ImageUpload } from "@/components/admin/ImageUpload";


export const Route = createFileRoute("/admin/banners")({
  component: AdminBanners,
});

const emptyForm = { title: "", subtitle: "", image_url: "", link_slug: "", sort_order: "0" };

function AdminBanners() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const {
    data: banners,
    isLoading,
    error,
  } = useQuery({ queryKey: ["admin", "banners"], queryFn: fetchAdminBanners });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "banners"] });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Informe o título do banner.");
      return;
    }
    const { error: err } = await supabase.from("banners").insert({
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      image_url: form.image_url.trim() || null,
      link_slug: form.link_slug.trim() || null,
      sort_order: Number(form.sort_order || 0),
    });
    if (err) {
      toast.error(adminErrorMessage(err, "Não foi possível criar o banner."));
      return;
    }
    toast.success("Banner criado!");
    setForm(emptyForm);
    setCreating(false);
    void refresh();
  };

  const patch = async (id: string, values: Partial<AdminBanner>) => {
    const { error: err } = await supabase.from("banners").update(values).eq("id", id);
    if (err) toast.error(adminErrorMessage(err));
    else void refresh();
  };

  const remove = async (b: AdminBanner) => {
    if (!confirm(`Excluir o banner "${b.title}"?`)) return;
    const { error: err } = await supabase.from("banners").delete().eq("id", b.id);
    if (err) toast.error(adminErrorMessage(err, "Não foi possível excluir."));
    else {
      toast.success("Banner excluído.");
      void refresh();
    }
  };

  return (
    <AdminPage>
      <AdminHeading
        title="Banners"
        action={
          <PrimaryButton onClick={() => setCreating((v) => !v)}>
            {creating ? "Fechar" : "Novo"}
          </PrimaryButton>
        }
      />
      <p className="text-xs text-muted-foreground">
        O envio de imagens ainda não está disponível — use o endereço (URL) de uma imagem já
        publicada.
      </p>

      {creating && (
        <form onSubmit={create} className="surface-card space-y-3 p-4">
          <Field label="Título">
            <input
              className={inputClass}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Subtítulo">
            <input
              className={inputClass}
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            />
          </Field>
          <ImageUpload
            folder="banners"
            value={form.image_url}
            onChange={(url) => setForm({ ...form, image_url: url })}
          />

          <div className="grid grid-cols-2 gap-2">
            <Field label="Categoria de destino (endereço curto)">
              <input
                className={inputClass}
                value={form.link_slug}
                onChange={(e) => setForm({ ...form, link_slug: e.target.value })}
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
          <PrimaryButton type="submit">CRIAR BANNER</PrimaryButton>
        </form>
      )}

      <StateBlock
        loading={isLoading}
        error={error}
        empty={(banners ?? []).length === 0}
        emptyText="Nenhum banner cadastrado."
      />

      <div className="space-y-2">
        {(banners ?? []).map((b) => (
          <Card key={b.id}>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-display text-sm font-bold">{b.title}</p>
              <StatusPill
                active={b.is_active}
                onClick={() => patch(b.id, { is_active: !b.is_active })}
              />
            </div>
            <Field label="Título">
              <input
                className={inputClass}
                defaultValue={b.title}
                onBlur={(e) =>
                  e.target.value.trim() ? patch(b.id, { title: e.target.value.trim() }) : undefined
                }
              />
            </Field>
            <Field label="Subtítulo">
              <input
                className={inputClass}
                defaultValue={b.subtitle ?? ""}
                onBlur={(e) => patch(b.id, { subtitle: e.target.value.trim() || null })}
              />
            </Field>
            <Field label="Imagem (URL)">
              <input
                className={inputClass}
                defaultValue={b.image_url ?? ""}
                onBlur={(e) => patch(b.id, { image_url: e.target.value.trim() || null })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Destino">
                <input
                  className={inputClass}
                  defaultValue={b.link_slug ?? ""}
                  onBlur={(e) => patch(b.id, { link_slug: e.target.value.trim() || null })}
                />
              </Field>
              <Field label="Ordem">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  defaultValue={b.sort_order}
                  onBlur={(e) => patch(b.id, { sort_order: Number(e.target.value || 0) })}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <GhostButton danger onClick={() => remove(b)}>
                Excluir
              </GhostButton>
            </div>
          </Card>
        ))}
      </div>
    </AdminPage>
  );
}
