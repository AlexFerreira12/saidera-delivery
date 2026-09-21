import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminErrorMessage, fetchAdminZones, type AdminZone } from "@/lib/admin";
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

export const Route = createFileRoute("/admin/entrega")({
  component: AdminZones,
});

const emptyForm = { neighborhood: "", fee: "5.99", min_order: "20", eta_minutes: "35" };

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

function AdminZones() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const {
    data: zones,
    isLoading,
    error,
  } = useQuery({ queryKey: ["admin", "zones"], queryFn: fetchAdminZones });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "zones"] });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const neighborhood = normalize(form.neighborhood);
    if (!neighborhood) {
      toast.error("Informe o bairro.");
      return;
    }
    const duplicate = (zones ?? []).some(
      (z) => z.neighborhood.trim().toLowerCase() === neighborhood.toLowerCase(),
    );
    if (duplicate) {
      toast.error("Esse bairro já está cadastrado.");
      return;
    }
    const { error: err } = await supabase.from("delivery_zones").insert({
      neighborhood,
      fee: Number(form.fee || 0),
      min_order: Number(form.min_order || 0),
      eta_minutes: Number(form.eta_minutes || 30),
    });
    if (err) {
      toast.error(adminErrorMessage(err, "Não foi possível criar o bairro."));
      return;
    }
    toast.success("Bairro cadastrado!");
    setForm(emptyForm);
    setCreating(false);
    void refresh();
  };

  const patch = async (id: string, values: Partial<AdminZone>) => {
    const { error: err } = await supabase.from("delivery_zones").update(values).eq("id", id);
    if (err) toast.error(adminErrorMessage(err));
    else void refresh();
  };

  const remove = async (z: AdminZone) => {
    if (!confirm(`Excluir o bairro "${z.neighborhood}"? Clientes desse bairro deixarão de pedir.`))
      return;
    const { error: err } = await supabase.from("delivery_zones").delete().eq("id", z.id);
    if (err) toast.error(adminErrorMessage(err, "Não foi possível excluir."));
    else {
      toast.success("Bairro excluído.");
      void refresh();
    }
  };

  const active = (zones ?? []).filter((z) => z.is_active);
  const inactive = (zones ?? []).filter((z) => !z.is_active);

  return (
    <AdminPage>
      <AdminHeading
        title="Bairros e taxas"
        action={
          <PrimaryButton onClick={() => setCreating((v) => !v)}>
            {creating ? "Fechar" : "Novo"}
          </PrimaryButton>
        }
      />
      <p className="text-xs text-muted-foreground">
        {active.length} bairro(s) atendido(s) · {inactive.length} desativado(s)
      </p>

      {creating && (
        <form onSubmit={create} className="surface-card space-y-3 p-4">
          <Field label="Bairro">
            <input
              className={inputClass}
              value={form.neighborhood}
              onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Taxa">
              <input
                className={inputClass}
                inputMode="decimal"
                value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })}
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
            <Field label="Tempo (min)">
              <input
                className={inputClass}
                inputMode="numeric"
                value={form.eta_minutes}
                onChange={(e) => setForm({ ...form, eta_minutes: e.target.value })}
              />
            </Field>
          </div>
          <PrimaryButton type="submit">CADASTRAR BAIRRO</PrimaryButton>
        </form>
      )}

      <StateBlock
        loading={isLoading}
        error={error}
        empty={(zones ?? []).length === 0}
        emptyText="Nenhum bairro cadastrado."
      />

      <div className="space-y-2">
        {(zones ?? []).map((z) => (
          <Card key={z.id} className={z.is_active ? "" : "opacity-70"}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-display text-sm font-bold">{z.neighborhood}</p>
                <p className="text-xs text-muted-foreground">
                  {brl(Number(z.fee))} · mín. {brl(Number(z.min_order))} · {z.eta_minutes} min
                </p>
              </div>
              <StatusPill
                active={z.is_active}
                onClick={() => patch(z.id, { is_active: !z.is_active })}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Taxa">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  defaultValue={Number(z.fee)}
                  onBlur={(e) => patch(z.id, { fee: Number(e.target.value || 0) })}
                />
              </Field>
              <Field label="Pedido mínimo">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  defaultValue={Number(z.min_order)}
                  onBlur={(e) => patch(z.id, { min_order: Number(e.target.value || 0) })}
                />
              </Field>
              <Field label="Tempo (min)">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  defaultValue={z.eta_minutes}
                  onBlur={(e) => patch(z.id, { eta_minutes: Number(e.target.value || 30) })}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <GhostButton danger onClick={() => remove(z)}>
                Excluir
              </GhostButton>
            </div>
          </Card>
        ))}
      </div>
    </AdminPage>
  );
}
