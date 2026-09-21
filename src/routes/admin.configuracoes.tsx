import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminErrorMessage, fetchSettings, type StoreSettings } from "@/lib/admin";
import {
  AdminHeading,
  AdminPage,
  Card,
  Field,
  PrimaryButton,
  StateBlock,
  inputClass,
} from "@/components/admin/ui";

export const Route = createFileRoute("/admin/configuracoes")({
  component: AdminSettings,
});

type FormState = Omit<StoreSettings, "id" | "is_open">;

function AdminSettings() {
  const qc = useQueryClient();
  const {
    data: settings,
    isLoading,
    error,
  } = useQuery({ queryKey: ["admin", "settings"], queryFn: fetchSettings });
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    const { id: _id, is_open: _open, ...rest } = settings;
    setForm(rest);
  }, [settings]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "settings"] });

  const toggleOpen = async () => {
    if (!settings) return;
    const next = !settings.is_open;
    if (!confirm(next ? "Abrir a loja para novos pedidos?" : "Fechar a loja para novos pedidos?"))
      return;
    const { error: err } = await supabase
      .from("store_settings")
      .update({ is_open: next })
      .eq("id", 1);
    if (err) toast.error(adminErrorMessage(err));
    else {
      toast.success(next ? "Loja aberta." : "Loja fechada.");
      void refresh();
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    const { error: err } = await supabase
      .from("store_settings")
      .update({
        store_name: form.store_name.trim(),
        phone: form.phone?.trim() || null,
        whatsapp: form.whatsapp?.trim() || null,
        address: form.address?.trim() || null,
        opening_hours: form.opening_hours?.trim() || null,
        logo_url: form.logo_url?.trim() || null,
        min_order: Number(form.min_order || 0),
        free_delivery_above: Number(form.free_delivery_above || 0),
        default_delivery_fee: Number(form.default_delivery_fee || 0),
        avg_delivery_minutes: Number(form.avg_delivery_minutes || 30),
      })
      .eq("id", 1);
    setSaving(false);
    if (err) toast.error(adminErrorMessage(err));
    else {
      toast.success("Configurações salvas!");
      void refresh();
    }
  };

  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <AdminPage>
      <AdminHeading title="Configurações da loja" />
      <StateBlock loading={isLoading} error={error} emptyText="" />

      {settings && (
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">Status atual</p>
            <p className="font-display text-lg font-extrabold">
              {settings.is_open ? "Loja aberta" : "Loja fechada"}
            </p>
          </div>
          <PrimaryButton onClick={toggleOpen}>
            {settings.is_open ? "FECHAR LOJA" : "ABRIR LOJA"}
          </PrimaryButton>
        </Card>
      )}

      {form && (
        <form onSubmit={save} className="surface-card space-y-3 p-4">
          <Field label="Nome da loja">
            <input
              className={inputClass}
              value={form.store_name}
              onChange={(e) => set({ store_name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Telefone">
              <input
                className={inputClass}
                value={form.phone ?? ""}
                onChange={(e) => set({ phone: e.target.value })}
              />
            </Field>
            <Field label="WhatsApp">
              <input
                className={inputClass}
                value={form.whatsapp ?? ""}
                onChange={(e) => set({ whatsapp: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Endereço">
            <input
              className={inputClass}
              value={form.address ?? ""}
              onChange={(e) => set({ address: e.target.value })}
            />
          </Field>
          <Field label="Horários de funcionamento">
            <input
              className={inputClass}
              value={form.opening_hours ?? ""}
              onChange={(e) => set({ opening_hours: e.target.value })}
            />
          </Field>
          <Field label="Logo (URL)">
            <input
              className={inputClass}
              value={form.logo_url ?? ""}
              onChange={(e) => set({ logo_url: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Pedido mínimo (R$)">
              <input
                className={inputClass}
                inputMode="decimal"
                value={form.min_order}
                onChange={(e) => set({ min_order: Number(e.target.value) })}
              />
            </Field>
            <Field label="Frete grátis acima de (R$)">
              <input
                className={inputClass}
                inputMode="decimal"
                value={form.free_delivery_above}
                onChange={(e) => set({ free_delivery_above: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Taxa padrão (R$)">
              <input
                className={inputClass}
                inputMode="decimal"
                value={form.default_delivery_fee}
                onChange={(e) => set({ default_delivery_fee: Number(e.target.value) })}
              />
            </Field>
            <Field label="Tempo médio de entrega (min)">
              <input
                className={inputClass}
                inputMode="numeric"
                value={form.avg_delivery_minutes}
                onChange={(e) => set({ avg_delivery_minutes: Number(e.target.value) })}
              />
            </Field>
          </div>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "SALVANDO..." : "SALVAR CONFIGURAÇÕES"}
          </PrimaryButton>
        </form>
      )}
    </AdminPage>
  );
}
