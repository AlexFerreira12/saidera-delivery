import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminErrorMessage, fetchAdminPromotions, type AdminPromotion } from "@/lib/admin";
import { fetchAdminProducts } from "@/lib/catalog";
import { brl } from "@/lib/format";
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

export const Route = createFileRoute("/admin/promocoes")({
  component: AdminPromotions,
});

const toInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const toIso = (value: string) => (value ? new Date(value).toISOString() : null);

const emptyForm = {
  product_id: "",
  min_quantity: "2",
  unit_price: "",
  label: "",
  starts_at: "",
  ends_at: "",
};

function AdminPromotions() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const {
    data: promotions,
    isLoading,
    error,
  } = useQuery({ queryKey: ["admin", "promotions"], queryFn: fetchAdminPromotions });
  const { data: products } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: fetchAdminProducts,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "promotions"] });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(form.min_quantity);
    const price = Number(form.unit_price);
    if (!form.product_id) {
      toast.error("Escolha o produto.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("A quantidade mínima deve ser maior que zero.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("O preço unitário deve ser maior que zero.");
      return;
    }
    if (form.starts_at && form.ends_at && new Date(form.starts_at) >= new Date(form.ends_at)) {
      toast.error("A data final deve ser depois da inicial.");
      return;
    }
    const { error: err } = await supabase.from("promotions").insert({
      product_id: form.product_id,
      type: "quantity_price",
      min_quantity: qty,
      unit_price: price,
      label: form.label.trim() || null,
      starts_at: toIso(form.starts_at),
      ends_at: toIso(form.ends_at),
    });
    if (err) {
      toast.error(adminErrorMessage(err, "Não foi possível criar a promoção."));
      return;
    }
    toast.success("Promoção criada!");
    setForm(emptyForm);
    setCreating(false);
    void refresh();
  };

  const patch = async (id: string, values: Partial<AdminPromotion>) => {
    const { error: err } = await supabase.from("promotions").update(values).eq("id", id);
    if (err) toast.error(adminErrorMessage(err));
    else void refresh();
  };

  const remove = async (p: AdminPromotion) => {
    if (!confirm("Excluir esta promoção?")) return;
    const { error: err } = await supabase.from("promotions").delete().eq("id", p.id);
    if (err) toast.error(adminErrorMessage(err, "Não foi possível excluir."));
    else {
      toast.success("Promoção excluída.");
      void refresh();
    }
  };

  return (
    <AdminPage>
      <AdminHeading
        title="Promoções por quantidade"
        action={
          <PrimaryButton onClick={() => setCreating((v) => !v)}>
            {creating ? "Fechar" : "Nova"}
          </PrimaryButton>
        }
      />

      {creating && (
        <form onSubmit={create} className="surface-card space-y-3 p-4">
          <Field label="Produto">
            <select
              className={inputClass}
              value={form.product_id}
              onChange={(e) => setForm({ ...form, product_id: e.target.value })}
            >
              <option value="">Selecione</option>
              {(products ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {brl(Number(p.price))}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="A partir de (unidades)">
              <input
                className={inputClass}
                inputMode="numeric"
                value={form.min_quantity}
                onChange={(e) => setForm({ ...form, min_quantity: e.target.value })}
              />
            </Field>
            <Field label="Preço por unidade">
              <input
                className={inputClass}
                inputMode="decimal"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Rótulo (ex.: Leve 6 pague menos)">
            <input
              className={inputClass}
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Início (opcional)">
              <input
                type="datetime-local"
                className={inputClass}
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              />
            </Field>
            <Field label="Fim (opcional)">
              <input
                type="datetime-local"
                className={inputClass}
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              />
            </Field>
          </div>
          <PrimaryButton type="submit">CRIAR PROMOÇÃO</PrimaryButton>
        </form>
      )}

      <StateBlock
        loading={isLoading}
        error={error}
        empty={(promotions ?? []).length === 0}
        emptyText="Nenhuma promoção cadastrada."
      />

      <div className="space-y-2">
        {(promotions ?? []).map((p) => (
          <Card key={p.id}>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">
                {p.products?.name ?? "Produto removido"}
              </p>
              <StatusPill
                active={p.is_active}
                onClick={() => patch(p.id, { is_active: !p.is_active })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="A partir de">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  defaultValue={p.min_quantity}
                  onBlur={(e) => {
                    const qty = Number(e.target.value);
                    if (qty > 0) void patch(p.id, { min_quantity: qty });
                    else toast.error("Quantidade deve ser maior que zero.");
                  }}
                />
              </Field>
              <Field label="Preço unitário">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  defaultValue={p.unit_price ?? ""}
                  onBlur={(e) => {
                    const price = Number(e.target.value);
                    if (price > 0) void patch(p.id, { unit_price: price });
                    else toast.error("Preço deve ser maior que zero.");
                  }}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Início">
                <input
                  type="datetime-local"
                  className={inputClass}
                  defaultValue={toInput(p.starts_at)}
                  onBlur={(e) => patch(p.id, { starts_at: toIso(e.target.value) })}
                />
              </Field>
              <Field label="Fim">
                <input
                  type="datetime-local"
                  className={inputClass}
                  defaultValue={toInput(p.ends_at)}
                  onBlur={(e) => patch(p.id, { ends_at: toIso(e.target.value) })}
                />
              </Field>
            </div>
            <Field label="Rótulo">
              <input
                className={inputClass}
                defaultValue={p.label ?? ""}
                onBlur={(e) => patch(p.id, { label: e.target.value.trim() || null })}
              />
            </Field>
            <div className="flex justify-end">
              <GhostButton danger onClick={() => remove(p)}>
                Excluir
              </GhostButton>
            </div>
          </Card>
        ))}
      </div>
    </AdminPage>
  );
}
