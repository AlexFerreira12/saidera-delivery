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
  latitude: number | null;
  longitude: number | null;
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
  latitude: null as number | null,
  longitude: null as number | null,
};

function AddressesPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

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
    if (form.latitude === null || form.longitude === null) {
      toast.error("Confirme sua localização antes de salvar.");
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
      latitude: form.latitude,
      longitude: form.longitude,
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
            <Input
              label="Bairro ou loteamento"
              value={form.neighborhood}
              onChange={(v) => setForm({ ...form, neighborhood: v })}
            />
            <p className="text-xs text-muted-foreground">
              Atendemos toda a área urbana de Guariba, inclusive loteamentos novos.
              Informe o bairro mesmo que ainda não apareça nos mapas.
            </p>
            <section className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-sm font-semibold">Localização da entrega</p>
              <p className="text-xs text-muted-foreground">Com sua autorização, utilizaremos o GPS do celular. Confira a posição no mapa: ela será usada na rota do entregador. Se o GPS indicar o lugar errado, solicite ajuda à loja antes de salvar.</p>
              <button type="button" disabled={locating} onClick={() => {
                if (!navigator.geolocation) { toast.error("Seu navegador não oferece localização."); return; }
                setLocating(true);
                navigator.geolocation.getCurrentPosition(
                  ({coords}) => { setForm(current => ({...current,latitude:coords.latitude,longitude:coords.longitude})); setLocating(false); },
                  () => { toast.error("Não foi possível obter a localização. Verifique a permissão do navegador."); setLocating(false); },
                  {enableHighAccuracy:true,timeout:15000,maximumAge:0}
                );
              }} className="w-full rounded-xl border border-primary px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50">{locating?"Localizando...":"Usar localização atual"}</button>
              {form.latitude !== null && form.longitude !== null && <>
                <iframe title="Prévia da localização da entrega" loading="lazy" className="h-52 w-full rounded-xl border" referrerPolicy="no-referrer" src={`https://www.openstreetmap.org/export/embed.html?bbox=${form.longitude-0.004}%2C${form.latitude-0.003}%2C${form.longitude+0.004}%2C${form.latitude+0.003}&layer=mapnik&marker=${form.latitude}%2C${form.longitude}`}/>
                <p className="text-xs text-muted-foreground">Confira o marcador. Esta versão ainda não permite arrastá-lo; use o GPS apenas se estiver no endereço de entrega.</p>
                <button type="button" className="text-xs font-semibold underline" onClick={()=>setForm(current=>({...current,latitude:null,longitude:null}))}>Limpar localização</button>
              </>}
            </section>
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
