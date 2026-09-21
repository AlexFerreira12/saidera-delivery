import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminErrorMessage, fetchAdminDrivers } from "@/lib/admin";
import { dateTimeBR } from "@/lib/format";
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

export const Route = createFileRoute("/admin/entregadores")({
  component: AdminDrivers,
});

const emptyForm = { email: "", name: "", phone: "", vehicle: "" };

function AdminDrivers() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "drivers"],
    queryFn: fetchAdminDrivers,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "drivers"] });

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim()) {
      toast.error("Informe o e-mail do usuário já cadastrado.");
      return;
    }
    const { error: err } = await supabase.rpc("admin_link_driver", {
      p_email: form.email.trim(),
      p_name: form.name.trim(),
      p_phone: form.phone.trim(),
      p_vehicle: form.vehicle.trim(),
    });
    if (err) {
      toast.error(adminErrorMessage(err, "Não foi possível vincular o entregador."));
      return;
    }
    toast.success("Entregador vinculado!");
    setForm(emptyForm);
    setCreating(false);
    void refresh();
  };

  const toggle = async (id: string, isActive: boolean) => {
    const { error: err } = await supabase
      .from("delivery_drivers")
      .update({ is_active: !isActive })
      .eq("id", id);
    if (err) toast.error(adminErrorMessage(err));
    else void refresh();
  };

  const unlink = async (id: string, name: string) => {
    if (!confirm(`Remover ${name} da equipe de entregas?`)) return;
    const { error: err } = await supabase.rpc("admin_unlink_driver", { p_driver_id: id });
    if (err) toast.error(adminErrorMessage(err, "Não foi possível remover o entregador."));
    else {
      toast.success("Entregador removido da equipe.");
      void refresh();
    }
  };

  const statFor = (driverId: string) => data?.stats.find((s) => s.driver_id === driverId);

  return (
    <AdminPage>
      <AdminHeading
        title="Entregadores"
        action={
          <PrimaryButton onClick={() => setCreating((v) => !v)}>
            {creating ? "Fechar" : "Vincular"}
          </PrimaryButton>
        }
      />
      <p className="text-xs text-muted-foreground">
        O entregador precisa criar a conta dele no app antes. Aqui você apenas vincula o e-mail dele
        à equipe — nenhuma senha é criada ou exibida.
      </p>

      {creating && (
        <form onSubmit={link} className="surface-card space-y-3 p-4">
          <Field label="E-mail do usuário já cadastrado">
            <input
              className={inputClass}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Nome de exibição (opcional)">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Telefone">
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Veículo">
              <input
                className={inputClass}
                value={form.vehicle}
                onChange={(e) => setForm({ ...form, vehicle: e.target.value })}
              />
            </Field>
          </div>
          <PrimaryButton type="submit">VINCULAR ENTREGADOR</PrimaryButton>
        </form>
      )}

      <StateBlock
        loading={isLoading}
        error={error}
        empty={(data?.drivers ?? []).length === 0}
        emptyText="Nenhum entregador vinculado ainda."
      />

      <div className="space-y-2">
        {(data?.drivers ?? []).map((d) => {
          const s = statFor(d.id);
          return (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-bold">{d.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.phone ?? "sem telefone"} · {d.vehicle ?? "sem veículo"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Number(s?.in_route ?? 0)} em rota · {Number(s?.delivered ?? 0)} entregues
                    {s?.last_delivery_at ? ` · última em ${dateTimeBR(s.last_delivery_at)}` : ""}
                  </p>
                </div>
                <StatusPill active={d.is_active} onClick={() => toggle(d.id, d.is_active)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Telefone">
                  <input
                    className={inputClass}
                    defaultValue={d.phone ?? ""}
                    onBlur={async (e) => {
                      const { error: err } = await supabase
                        .from("delivery_drivers")
                        .update({ phone: e.target.value.trim() || null })
                        .eq("id", d.id);
                      if (err) toast.error(adminErrorMessage(err));
                      else void refresh();
                    }}
                  />
                </Field>
                <Field label="Veículo">
                  <input
                    className={inputClass}
                    defaultValue={d.vehicle ?? ""}
                    onBlur={async (e) => {
                      const { error: err } = await supabase
                        .from("delivery_drivers")
                        .update({ vehicle: e.target.value.trim() || null })
                        .eq("id", d.id);
                      if (err) toast.error(adminErrorMessage(err));
                      else void refresh();
                    }}
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <GhostButton danger onClick={() => unlink(d.id, d.name)}>
                  Remover da equipe
                </GhostButton>
              </div>
            </Card>
          );
        })}
      </div>
    </AdminPage>
  );
}
