import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminErrorMessage, fetchAdminCoupons, type AdminCoupon } from "@/lib/admin";
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

export const Route = createFileRoute("/admin/cupons")({
  component: AdminCoupons,
});

const toInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const toIso = (value: string) => (value ? new Date(value).toISOString() : null);

const TYPES = [
  { value: "percent", label: "Percentual (%)" },
  { value: "fixed", label: "Valor fixo (R$)" },
  { value: "free_shipping", label: "Frete grátis" },
];

const emptyForm = {
  code: "",
  discount_type: "percent",
  discount_value: "10",
  min_order: "0",
  starts_at: "",
  ends_at: "",
  max_uses: "",
  max_uses_per_user: "1",
  first_order_only: false,
};

function AdminCoupons() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const {
    data: coupons,
    isLoading,
    error,
  } = useQuery({ queryKey: ["admin", "coupons"], queryFn: fetchAdminCoupons });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "coupons"] });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    const value = Number(form.discount_value || 0);
    if (!code) {
      toast.error("Informe o código do cupom.");
      return;
    }
    if (form.discount_type !== "free_shipping" && value <= 0) {
      toast.error("O valor do desconto deve ser maior que zero.");
      return;
    }
    if (form.starts_at && form.ends_at && new Date(form.starts_at) >= new Date(form.ends_at)) {
      toast.error("A data final deve ser depois da inicial.");
      return;
    }
    const { error: err } = await supabase.from("coupons").insert({
      code,
      discount_type: form.discount_type,
      discount_value: form.discount_type === "free_shipping" ? 0 : value,
      min_order: Number(form.min_order || 0),
      starts_at: toIso(form.starts_at),
      ends_at: toIso(form.ends_at),
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      max_uses_per_user: Number(form.max_uses_per_user || 1),
      first_order_only: form.first_order_only,
    });
    if (err) {
      toast.error(adminErrorMessage(err, "Não foi possível criar o cupom."));
      return;
    }
    toast.success("Cupom criado!");
    setForm(emptyForm);
    setCreating(false);
    void refresh();
  };

  const patch = async (id: string, values: Partial<AdminCoupon>) => {
    const { error: err } = await supabase.from("coupons").update(values).eq("id", id);
    if (err) toast.error(adminErrorMessage(err));
    else void refresh();
  };

  const remove = async (c: AdminCoupon) => {
    if (!confirm(`Excluir o cupom ${c.code}?`)) return;
    const { error: err } = await supabase.from("coupons").delete().eq("id", c.id);
    if (err)
      toast.error(
        adminErrorMessage(err, "Cupom já usado em pedidos não pode ser excluído. Desative-o."),
      );
    else {
      toast.success("Cupom excluído.");
      void refresh();
    }
  };

  return (
    <AdminPage>
      <AdminHeading
        title="Cupons"
        action={
          <PrimaryButton onClick={() => setCreating((v) => !v)}>
            {creating ? "Fechar" : "Novo"}
          </PrimaryButton>
        }
      />

      {creating && (
        <form onSubmit={create} className="surface-card space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Código">
              <input
                className={inputClass}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Tipo">
              <select
                className={inputClass}
                value={form.discount_type}
                onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Valor do desconto">
              <input
                className={inputClass}
                inputMode="decimal"
                disabled={form.discount_type === "free_shipping"}
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
              />
            </Field>
            <Field label="Pedido mínimo">
              <input
                className={inputClass}
                inputMode="decimal"
                value={form.min_order}
                onChange={(e) => setForm({ ...form, min_order: e.target.value })}
              />
            </Field>
          </div>
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
          <div className="grid grid-cols-2 gap-2">
            <Field label="Limite total (vazio = sem limite)">
              <input
                className={inputClass}
                inputMode="numeric"
                value={form.max_uses}
                onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
              />
            </Field>
            <Field label="Limite por cliente">
              <input
                className={inputClass}
                inputMode="numeric"
                value={form.max_uses_per_user}
                onChange={(e) => setForm({ ...form, max_uses_per_user: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.first_order_only}
              onChange={(e) => setForm({ ...form, first_order_only: e.target.checked })}
            />
            Somente na primeira compra
          </label>
          <PrimaryButton type="submit">CRIAR CUPOM</PrimaryButton>
        </form>
      )}

      <StateBlock
        loading={isLoading}
        error={error}
        empty={(coupons ?? []).length === 0}
        emptyText="Nenhum cupom cadastrado."
      />

      <div className="space-y-2">
        {(coupons ?? []).map((c) => (
          <Card key={c.id}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-display text-sm font-bold">{c.code}</p>
                <p className="text-xs text-muted-foreground">
                  {c.discount_type === "free_shipping"
                    ? "Frete grátis"
                    : c.discount_type === "percent"
                      ? `${Number(c.discount_value)}% de desconto`
                      : `${brl(Number(c.discount_value))} de desconto`}{" "}
                  · mín. {brl(Number(c.min_order))} · usado {c.used_count}
                  {c.max_uses ? `/${c.max_uses}` : ""}x
                  {c.first_order_only ? " · 1ª compra" : ""}
                </p>
              </div>
              <StatusPill
                active={c.is_active}
                onClick={() => patch(c.id, { is_active: !c.is_active })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Valor">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  defaultValue={Number(c.discount_value)}
                  onBlur={(e) => patch(c.id, { discount_value: Number(e.target.value || 0) })}
                />
              </Field>
              <Field label="Pedido mínimo">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  defaultValue={Number(c.min_order)}
                  onBlur={(e) => patch(c.id, { min_order: Number(e.target.value || 0) })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Início">
                <input
                  type="datetime-local"
                  className={inputClass}
                  defaultValue={toInput(c.starts_at)}
                  onBlur={(e) => patch(c.id, { starts_at: toIso(e.target.value) })}
                />
              </Field>
              <Field label="Fim">
                <input
                  type="datetime-local"
                  className={inputClass}
                  defaultValue={toInput(c.ends_at)}
                  onBlur={(e) => patch(c.id, { ends_at: toIso(e.target.value) })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Limite total">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  defaultValue={c.max_uses ?? ""}
                  onBlur={(e) =>
                    patch(c.id, { max_uses: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </Field>
              <Field label="Limite por cliente">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  defaultValue={c.max_uses_per_user}
                  onBlur={(e) => patch(c.id, { max_uses_per_user: Number(e.target.value || 1) })}
                />
              </Field>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  defaultChecked={c.first_order_only}
                  onChange={(e) => patch(c.id, { first_order_only: e.target.checked })}
                />
                Somente 1ª compra
              </label>
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
