import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { brl, dateTimeBR } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";

export const Route = createFileRoute("/pedidos")({
  head: () => ({
    meta: [
      { title: "Meus pedidos — Bebidas Guariba" },
      {
        name: "description",
        content: "Histórico de pedidos e status das suas entregas em Guariba/SP.",
      },
      { property: "og:title", content: "Meus pedidos — Bebidas Guariba" },
      { property: "og:description", content: "Acompanhe seu histórico de pedidos." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const { data: orders } = useQuery({
    queryKey: ["orders", "mine"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, total, created_at")
        .eq("user_id", session!.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell>
      <PageHeader title="Meus pedidos" />
      <div className="space-y-3 p-4">
        {orders?.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Você ainda não fez nenhum pedido.
          </p>
        )}
        {(orders ?? []).map((o) => (
          <Link
            key={o.id}
            to="/pedido/$id"
            params={{ id: o.id }}
            className="surface-card flex items-center gap-3 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Pedido #{o.order_number}</p>
              <p className="text-xs text-muted-foreground">{dateTimeBR(o.created_at)}</p>
              <p className="mt-1 text-xs font-semibold text-primary">
                {STATUS_LABEL[o.status] ?? o.status}
              </p>
            </div>
            <span className="font-display text-sm font-bold">{brl(o.total)}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
