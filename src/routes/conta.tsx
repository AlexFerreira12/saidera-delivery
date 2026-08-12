import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ChevronRight, LogOut, MapPin, Package, Heart, Shield, Bike } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/conta")({
  head: () => ({
    meta: [
      { title: "Minha conta — Bebidas Guariba" },
      { name: "description", content: "Gerencie seus dados, endereços e pedidos na distribuidora de Guariba/SP." },
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
