import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Address = {
  id: string;
  label: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  reference: string | null;
  zipcode: string | null;
  is_default: boolean;
};

export const Route = createFileRoute("/enderecos")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Meus endereços — Bebidas Guariba" },
      { name: "description", content: "Cadastre e gerencie endereços de entrega em Guariba/SP." },
      { property: "og:title", content: "Meus endereços — Bebidas Guariba" },
      { property: "og:description", content: "Gerencie seus endereços de entrega." },
    ],
  }),
  component: AddressesPage,
});

export async function fetchAddresses() {
  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Address[];
}

export function useZones() {
  return useQuery({
    queryKey: ["zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_zones")
        .select("*")
        .eq("is_active", true)
        .order("neighborhood");
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        neighborhood: string;
        fee: number;
        min_order: number;
        eta_minutes: number;
      }[];
    },
  });
}

const empty = {
  label: "Casa",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  reference: "",
  zipcode: "",
};

function AddressesPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const zones = useZones();

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const { data: addresses } = useQuery({
    queryKey: ["addresses"],
    queryFn: fetchAddresses,
    enabled: !!session,
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.street || !form.number || !form.neighborhood) {
      toast.error("Preencha rua, número e bairro.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("addresses").insert({
      user_id: session!.user.id,
      label: form.label,
      street: form.street,
      number: form.number,
      complement: form.complement || null,
      neighborhood: form.neighborhood,
      reference: form.reference || null,
      zipcode: form.zipcode || null,
      is_default: !addresses || addresses.length === 0,
    });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar o endereço.");
      return;
    }
    toast.success("Endereço salvo!");
    setForm(empty);
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["addresses"] });
  };

  const setDefault = async (id: string) => {
    await supabase.from("addresses").update({ is_default: false }).eq("user_id", session!.user.id);
    await supabase.from("addresses").update({ is_default: true }).eq("id", id);
    void qc.invalidateQueries({ queryKey: ["addresses"] });
  };

  const remove = async (id: string) => {
    await supabase.from("addresses").delete().eq("id", id);
    void qc.invalidateQueries({ queryKey: ["addresses"] });
  };

  return (
    <AppShell hideCartBar>
      <PageHeader title="Meus endereços" />
      <div className="space-y-3 p-4">
        {(addresses ?? []).map((a) => (
          <div key={a.id} className="surface-card flex items-start gap-3 p-4">
            <MapPin className="mt-0.5 h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                {a.label}{" "}
                {a.is_default && (
                  <span className="text-xs font-semibold text-success">• padrão</span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {a.street}, {a.number}
                {a.complement ? ` - ${a.complement}` : ""} — {a.neighborhood}, {a.city}/{a.state}
              </p>
              {!a.is_default && (
                <button
                  type="button"
                  onClick={() => setDefault(a.id)}
                  className="mt-2 text-xs font-semibold text-primary"
                >
                  Tornar padrão
                </button>
              )}
            </div>
            <button type="button" aria-label="Excluir endereço" onClick={() => remove(a.id)}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        ))}

        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-4 text-sm font-bold text-primary"
          >
            <Plus className="h-4 w-4" /> Adicionar endereço
          </button>
        ) : (
          <form onSubmit={save} className="surface-card space-y-3 p-4">
            <Input
              label="Identificação"
              value={form.label}
              onChange={(v) => setForm({ ...form, label: v })}
            />
            <Input
              label="Rua"
              value={form.street}
              onChange={(v) => setForm({ ...form, street: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Número"
                value={form.number}
                onChange={(v) => setForm({ ...form, number: v })}
              />
              <Input
                label="Complemento"
                value={form.complement}
                onChange={(v) => setForm({ ...form, complement: v })}
              />
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Bairro</span>
              <select
                value={form.neighborhood}
                onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
              >
                <option value="">Selecione o bairro</option>
                {(zones.data ?? []).map((z) => (
                  <option key={z.id} value={z.neighborhood}>
                    {z.neighborhood}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Ponto de referência"
              value={form.reference}
              onChange={(v) => setForm({ ...form, reference: v })}
            />
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              SALVAR ENDEREÇO
            </button>
          </form>
        )}
        <p className="pt-2 text-center text-xs text-muted-foreground">
          Entregamos apenas em Guariba/SP.
        </p>
      </div>
    </AppShell>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-ring"
      />
    </label>
  );
}
