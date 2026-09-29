import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { DeliveryMapPicker } from "@/components/DeliveryMapPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchAddresses } from "@/lib/addresses";

export const Route = createFileRoute("/enderecos")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }, { title: "Meus endereços — SAIDERA" }],
  }),
  component: AddressesPage,
});

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
    if (
      !Number.isFinite(form.latitude) ||
      !Number.isFinite(form.longitude) ||
      form.latitude < -90 ||
      form.latitude > 90 ||
      form.longitude < -180 ||
      form.longitude > 180
    ) {
      toast.error("A localização selecionada é inválida. Marque novamente no mapa.");
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
              Atendemos toda a área urbana de Guariba, inclusive loteamentos novos. Informe o bairro
              mesmo que ainda não apareça nos mapas.
            </p>
            <section className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-sm font-semibold">Localização da entrega</p>
              <p className="text-xs text-muted-foreground">
                Com sua autorização, utilizaremos o GPS do celular. Confira a posição no mapa e
                toque no ponto correto, mesmo que esteja cadastrando outro endereço. A posição
                confirmada será usada na rota do entregador.
              </p>
              <button
                type="button"
                disabled={locating}
                onClick={() => {
                  if (!navigator.geolocation) {
                    toast.error("Seu navegador não oferece localização.");
                    return;
                  }
                  setLocating(true);
                  navigator.geolocation.getCurrentPosition(
                    ({ coords }) => {
                      setForm((current) => ({
                        ...current,
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                      }));
                      setLocating(false);
                    },
                    () => {
                      toast.error(
                        "Não foi possível obter a localização. Verifique a permissão do navegador.",
                      );
                      setLocating(false);
                    },
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
                  );
                }}
                className="w-full rounded-xl border border-primary px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50"
              >
                {locating ? "Localizando..." : "Usar localização atual"}
              </button>
              <DeliveryMapPicker
                value={
                  form.latitude === null || form.longitude === null
                    ? null
                    : { latitude: form.latitude, longitude: form.longitude }
                }
                onChange={(point) => setForm((current) => ({ ...current, ...point }))}
              />
              {form.latitude !== null && form.longitude !== null && (
                <p className="text-xs text-muted-foreground">
                  Marcador: {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}
                </p>
              )}
              <button
                type="button"
                className="text-xs font-semibold underline"
                onClick={() =>
                  setForm((current) => ({ ...current, latitude: null, longitude: null }))
                }
              >
                Limpar localização
              </button>
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
