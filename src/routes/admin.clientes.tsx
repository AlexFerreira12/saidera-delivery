import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchAdminCustomers } from "@/lib/admin";
import { brl, dateTimeBR } from "@/lib/format";
import {
  AdminHeading,
  AdminPage,
  Card,
  StateBlock,
  inputClass,
} from "@/components/admin/ui";

export const Route = createFileRoute("/admin/clientes")({
  component: AdminCustomers,
});

function AdminCustomers() {
  const [search, setSearch] = useState("");
  const {
    data: customers,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "customers", search],
    queryFn: () => fetchAdminCustomers(search),
  });

  return (
    <AdminPage>
      <AdminHeading title="Clientes" />
      <input
        className={inputClass}
        placeholder="Buscar por nome, telefone ou e-mail"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <StateBlock
        loading={isLoading}
        error={error}
        empty={(customers ?? []).length === 0}
        emptyText="Nenhum cliente encontrado."
      />

      <div className="space-y-2">
        {(customers ?? []).map((c) => (
          <Card key={c.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-bold">
                  {c.full_name ?? "Sem nome"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.phone ?? "sem telefone"} · {c.email ?? "sem e-mail"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Cliente desde {dateTimeBR(c.created_at)}
                  {c.last_order_at ? ` · último pedido em ${dateTimeBR(c.last_order_at)}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-sm font-bold">{brl(Number(c.orders_total))}</p>
                <p className="text-xs text-muted-foreground">{Number(c.orders_count)} pedido(s)</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </AdminPage>
  );
}
