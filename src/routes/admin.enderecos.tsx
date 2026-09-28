import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/enderecos")({ component: AddressReviews });
type ReviewAddress = {
  id: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  reference: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
};
type Approval = {
  address_id: string;
  approved: boolean;
  reviewed_at: string | null;
  review_note: string | null;
};
type Eligibility = "inside" | "override" | "pending" | "outside" | "invalid";
function AddressReviews() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const addresses = useQuery({
    queryKey: ["admin", "review-addresses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addresses")
        .select("id,street,number,neighborhood,city,state,reference,latitude,longitude,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ReviewAddress[];
    },
  });
  const approvals = useQuery({
    queryKey: ["admin", "address-approvals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_address_approvals" as never)
        .select("address_id,approved,reviewed_at,review_note");
      if (error) throw error;
      return data as Approval[];
    },
  });
  const eligibility = useQuery({
    queryKey: ["admin", "address-eligibility", addresses.data?.map((a) => a.id).join(",")],
    enabled: !!addresses.data,
    queryFn: async () => {
      const entries = await Promise.all(
        (addresses.data ?? []).map(async (a) => {
          const { data, error } = await supabase.rpc(
            "delivery_address_eligibility" as never,
            { p_address_id: a.id } as never,
          );
          if (error) throw error;
          return [a.id, data as unknown as Eligibility] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, Eligibility>;
    },
  });
  const review = async (address: ReviewAddress, approved: boolean) => {
    if (address.latitude == null || address.longitude == null) {
      toast.error("Endereço sem coordenadas confirmadas. Solicite a localização ao cliente.");
      return;
    }
    const note = prompt(
      approved
        ? "Confirme que o ponto fica na área urbana de Guariba. Observação (opcional):"
        : "Informe o motivo da recusa ou necessidade de correção:",
    );
    if (note === null) return;
    if (!approved && !note.trim()) {
      toast.error("Informe o motivo.");
      return;
    }
    setBusy(address.id);
    try {
      const { error } = await supabase.rpc(
        "admin_review_delivery_address" as never,
        { p_address_id: address.id, p_approved: approved, p_note: note.trim() || null } as never,
      );
      if (error) throw error;
      toast.success(approved ? "Endereço aprovado." : "Endereço sinalizado para correção.");
      await qc.invalidateQueries({ queryKey: ["admin", "address-approvals"] });
    } catch {
      toast.error("Não foi possível registrar a revisão.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <main className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Validação de endereços</h1>
      <p className="text-sm text-muted-foreground">
        Confira o marcador e o perímetro urbano antes de aprovar. A posição declarada pelo cliente
        não comprova cobertura automaticamente.
      </p>
      {(addresses.isLoading || approvals.isLoading) && <p>Carregando endereços...</p>}
      {(addresses.error || approvals.error) && (
        <p className="text-destructive">
          Não foi possível consultar os endereços. A tabela de aprovações precisa estar implantada.
        </p>
      )}
      {addresses.data?.map((a) => {
        const approval = approvals.data?.find((v) => v.address_id === a.id);
        const status = eligibility.data?.[a.id];
        const coordinates = a.latitude != null && a.longitude != null;
        const automatic = status === "inside";
        return (
          <section key={a.id} className="surface-card space-y-2 p-4">
            <p className="font-semibold">
              {a.street}, {a.number} — {a.neighborhood}
            </p>
            <p className="text-xs text-muted-foreground">
              {a.city}/{a.state}
              {a.reference ? ` · ${a.reference}` : ""}
            </p>
            <p className="text-sm">
              {status === "inside"
                ? "Dentro da cobertura (automático)"
                : status === "override"
                  ? "Aprovado manualmente"
                  : status === "outside"
                    ? "Fora de Guariba/SP"
                    : status === "invalid"
                      ? "Endereço inválido"
                      : approval && !approval.approved
                        ? "Correção solicitada"
                        : "Aguardando revisão"}
            </p>
            {approval?.review_note && <p className="text-xs">{approval.review_note}</p>}
            {coordinates ? (
              <a
                className="block text-sm font-semibold text-primary underline"
                href={`https://www.openstreetmap.org/?mlat=${a.latitude}&mlon=${a.longitude}#map=17/${a.latitude}/${a.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Conferir ponto no mapa
              </a>
            ) : (
              <p className="text-xs text-destructive">Sem localização confirmada</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy === a.id || !coordinates || automatic}
                onClick={() => void review(a, true)}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                Aprovar
              </button>
              <button
                type="button"
                disabled={busy === a.id}
                onClick={() => void review(a, false)}
                className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
              >
                Solicitar correção
              </button>
            </div>
          </section>
        );
      })}
    </main>
  );
}
