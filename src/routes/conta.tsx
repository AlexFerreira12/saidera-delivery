import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, LogOut, MapPin, Package, Heart, Shield, Bike } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { deleteMyAccount, exportMyData } from "@/lib/account.functions";

export const Route = createFileRoute("/conta")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Minha conta — Bebidas Guariba" },
      {
        name: "description",
        content: "Gerencie seus dados, endereços e pedidos na distribuidora de Guariba/SP.",
      },
      { property: "og:title", content: "Minha conta — Bebidas Guariba" },
      { property: "og:description", content: "Seus dados, endereços e pedidos." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { session, profile, roles, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const exportData = useServerFn(exportMyData);
  const closeAccount = useServerFn(deleteMyAccount);
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);

  const downloadData = async () => {
    if (busy) return;
    setBusy("export");
    try {
      const data = await exportData({});
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "meus-dados.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Não foi possível gerar seus dados agora.");
    } finally {
      setBusy(null);
    }
  };

  const closeMyAccount = async () => {
    if (busy) return;
    if (!confirm("Encerrar sua conta? Seus dados pessoais serão apagados e o acesso encerrado."))
      return;
    setBusy("delete");
    try {
      await closeAccount({ data: { confirm: "ENCERRAR" } });
      await supabase.auth.signOut();
      toast.success("Conta encerrada.");
      void navigate({ to: "/" });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      toast.error(
        code.includes("PEDIDO_EM_ANDAMENTO")
          ? "Você tem um pedido em andamento. Aguarde a conclusão para encerrar a conta."
          : "Não foi possível encerrar a conta agora.",
      );
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    void navigate({ to: "/" });
  };

  return (
    <AppShell>
      <PageHeader title="Minha conta" />
      <div className="space-y-4 p-4">
        <div className="surface-card p-4">
          <p className="font-display text-lg font-extrabold">{profile?.full_name ?? "Cliente"}</p>
          <p className="text-sm text-muted-foreground">{session?.user.email}</p>
          {profile?.phone && <p className="text-sm text-muted-foreground">{profile.phone}</p>}
        </div>

        <div className="surface-card divide-y divide-border overflow-hidden">
          <Item to="/pedidos" icon={<Package className="h-4 w-4" />} label="Meus pedidos" />
          <Item to="/enderecos" icon={<MapPin className="h-4 w-4" />} label="Meus endereços" />
          <Item to="/favoritos" icon={<Heart className="h-4 w-4" />} label="Favoritos" />
          {roles.includes("admin") && (
            <Item to="/admin" icon={<Shield className="h-4 w-4" />} label="Painel administrativo" />
          )}
          {(roles.includes("driver") || roles.includes("admin")) && (
            <Item to="/entregador" icon={<Bike className="h-4 w-4" />} label="Área do entregador" />
          )}
        </div>

        <div className="surface-card space-y-2 p-4">
          <p className="text-sm font-bold">Meus dados</p>
          <p className="text-xs text-muted-foreground">
            Baixe uma cópia dos seus dados ou encerre sua conta. O histórico de vendas é mantido de
            forma anônima, como exige o registro fiscal.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void downloadData()}
              disabled={busy !== null}
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-60"
            >
              {busy === "export" ? "Gerando…" : "Baixar meus dados"}
            </button>
            <button
              type="button"
              onClick={() => void closeMyAccount()}
              disabled={busy !== null}
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold text-destructive disabled:opacity-60"
            >
              {busy === "delete" ? "Encerrando…" : "Encerrar minha conta"}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm font-bold text-destructive"
        >
          <LogOut className="h-4 w-4" /> Sair da conta
        </button>
      </div>
    </AppShell>
  );
}

function Item({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 p-4 text-sm font-semibold">
      <span className="text-primary">{icon}</span>
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
