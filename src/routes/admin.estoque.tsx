import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  STOCK_KIND_LABEL,
  fetchStockHistory,
  fetchStockProducts,
  stockAdjust,
  stockBulkEntry,
  stockEntry,
  stockErrorMessage,
  stockInventory,
  type StockKind,
  type StockProduct,
} from "@/lib/stock";
import { dateTimeBR } from "@/lib/format";
import {
  AdminHeading,
  AdminPage,
  Card,
  Field,
  GhostButton,
  PrimaryButton,
  StateBlock,
  inputClass,
} from "@/components/admin/ui";

export const Route = createFileRoute("/admin/estoque")({
  component: AdminStock,
});

const PAGE_SIZE = 25;

type Action = "entrada" | "ajuste" | "perda" | "inventario";

function AdminStock() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"lista" | "historico">("lista");
  const [open, setOpen] = useState<string | null>(null);
  const [action, setAction] = useState<Action>("entrada");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState<Record<string, string>>({});
  const [bulkReason, setBulkReason] = useState("");

  const [histKind, setHistKind] = useState("");
  const [histFrom, setHistFrom] = useState("");
  const [histTo, setHistTo] = useState("");
  const [page, setPage] = useState(0);

  const {
    data: products,
    isLoading,
    error,
  } = useQuery({ queryKey: ["admin", "stock", "products"], queryFn: fetchStockProducts });

  const history = useQuery({
    queryKey: ["admin", "stock", "history", histKind, histFrom, histTo, page],
    queryFn: () =>
      fetchStockHistory({
        kind: histKind,
        from: histFrom ? new Date(histFrom).toISOString() : undefined,
        to: histTo ? new Date(`${histTo}T23:59:59`).toISOString() : undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    enabled: tab === "historico",
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "stock"] });
    void qc.invalidateQueries({ queryKey: ["admin", "products"] });
    void qc.invalidateQueries({ queryKey: ["admin", "low-stock"] });
    void qc.invalidateQueries({ queryKey: ["admin", "metrics"] });
  };

  const resetForm = () => {
    setQty("");
    setCost("");
    setReason("");
  };

  const submit = async (p: StockProduct) => {
    const n = Number(qty);
    if (!qty || Number.isNaN(n)) {
      toast.error("Informe a quantidade.");
      return;
    }
    setBusy(true);
    try {
      if (action === "entrada") {
        await stockEntry(p.id, Math.abs(n), reason, Number(cost) || undefined);
        toast.success("Entrada registrada!");
      } else if (action === "inventario") {
        const res = await stockInventory(p.id, Math.abs(n), reason);
        toast.success(res.changed ? "Inventário aplicado!" : "Contagem igual ao estoque atual.");
      } else if (action === "perda") {
        await stockAdjust(p.id, -Math.abs(n), "perda", reason);
        toast.success("Perda registrada.");
      } else {
        await stockAdjust(p.id, n, "ajuste", reason);
        toast.success("Ajuste registrado.");
      }
      resetForm();
      setOpen(null);
      refresh();
    } catch (err) {
      toast.error(stockErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitBulk = async () => {
    const items = Object.entries(bulk)
      .map(([product_id, v]) => ({ product_id, quantity: Number(v) }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) {
      toast.error("Informe a quantidade de ao menos um produto.");
      return;
    }
    setBusy(true);
    try {
      await stockBulkEntry(items, bulkReason);
      toast.success(`Reposição aplicada em ${items.length} produto(s).`);
      setBulk({});
      setBulkReason("");
      setBulkOpen(false);
      refresh();
    } catch (err) {
      toast.error(stockErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const list = (products ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const low = (products ?? []).filter((p) => p.stock <= p.min_stock);

  return (
    <AdminPage>
      <AdminHeading
        title="Estoque"
        action={
          <PrimaryButton onClick={() => setBulkOpen((v) => !v)}>
            {bulkOpen ? "Fechar" : "Repor em lote"}
          </PrimaryButton>
        }
      />

      <div className="flex gap-2">
        {(["lista", "historico"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {t === "lista" ? "Produtos" : "Histórico"}
          </button>
        ))}
      </div>

      {low.length > 0 && tab === "lista" && (
        <p className="text-xs font-semibold text-destructive">
          {low.length} produto(s) no mínimo ou zerado(s).
        </p>
      )}

      {bulkOpen && (
        <Card>
          <p className="font-display text-sm font-bold">Reposição em lote</p>
          <p className="text-xs text-muted-foreground">
            Ou entra tudo, ou nada — se algum item estiver inválido, nenhuma quantidade é aplicada.
          </p>
          <Field label="Motivo (opcional)">
            <input
              className={inputClass}
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="Ex.: nota fiscal 1234"
            />
          </Field>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {list.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs">{p.name}</span>
                <input
                  className="w-20 rounded-lg border border-input bg-card px-2 py-1 text-center text-sm outline-none"
                  inputMode="numeric"
                  value={bulk[p.id] ?? ""}
                  onChange={(e) => setBulk({ ...bulk, [p.id]: e.target.value })}
                  aria-label={`Quantidade para ${p.name}`}
                />
              </div>
            ))}
          </div>
          <PrimaryButton onClick={submitBulk} disabled={busy}>
            {busy ? "APLICANDO..." : "APLICAR REPOSIÇÃO"}
          </PrimaryButton>
        </Card>
      )}

      {tab === "lista" && (
        <>
          <input
            className={inputClass}
            placeholder="Buscar produto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <StateBlock
            loading={isLoading}
            error={error}
            empty={list.length === 0}
            emptyText="Nenhum produto encontrado."
          />

          <div className="space-y-2">
            {list.map((p) => (
              <Card key={p.id}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-bold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.stock} em estoque · mínimo {p.min_stock}
                      {p.stock === 0 ? (
                        <span className="ml-1 font-bold text-destructive">zerado</span>
                      ) : p.stock <= p.min_stock ? (
                        <span className="ml-1 font-bold text-destructive">baixo</span>
                      ) : null}
                    </p>
                  </div>
                  <GhostButton
                    onClick={() => {
                      setOpen(open === p.id ? null : p.id);
                      setAction("entrada");
                      resetForm();
                    }}
                  >
                    {open === p.id ? "Fechar" : "Movimentar"}
                  </GhostButton>
                </div>

                {open === p.id && (
                  <div className="space-y-2 border-t border-border pt-2">
                    <div className="flex flex-wrap gap-1">
                      {(["entrada", "ajuste", "perda", "inventario"] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAction(a)}
                          className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                            action === a
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {a === "inventario" ? "Inventário" : a[0].toUpperCase() + a.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field
                        label={
                          action === "inventario"
                            ? "Estoque contado"
                            : action === "ajuste"
                              ? "Variação (+ ou -)"
                              : "Quantidade"
                        }
                      >
                        <input
                          className={inputClass}
                          inputMode="numeric"
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                        />
                      </Field>
                      {action === "entrada" && (
                        <Field label="Custo unitário (opcional)">
                          <input
                            className={inputClass}
                            inputMode="decimal"
                            value={cost}
                            onChange={(e) => setCost(e.target.value)}
                          />
                        </Field>
                      )}
                    </div>
                    <Field label={action === "entrada" ? "Motivo (opcional)" : "Motivo"}>
                      <input
                        className={inputClass}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </Field>
                    <PrimaryButton onClick={() => submit(p)} disabled={busy}>
                      {busy ? "SALVANDO..." : "CONFIRMAR"}
                    </PrimaryButton>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === "historico" && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Tipo">
              <select
                className={inputClass}
                value={histKind}
                onChange={(e) => {
                  setHistKind(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">Todos</option>
                {Object.entries(STOCK_KIND_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="De">
              <input
                type="date"
                className={inputClass}
                value={histFrom}
                onChange={(e) => {
                  setHistFrom(e.target.value);
                  setPage(0);
                }}
              />
            </Field>
            <Field label="Até">
              <input
                type="date"
                className={inputClass}
                value={histTo}
                onChange={(e) => {
                  setHistTo(e.target.value);
                  setPage(0);
                }}
              />
            </Field>
          </div>

          <StateBlock
            loading={history.isLoading}
            error={history.error}
            empty={(history.data ?? []).length === 0}
            emptyText="Nenhuma movimentação no período."
          />

          <div className="space-y-2">
            {(history.data ?? []).map((m) => (
              <Card key={m.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-bold">{m.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {STOCK_KIND_LABEL[m.kind as StockKind] ?? m.kind}
                      {m.order_number ? ` · pedido #${m.order_number}` : ""}
                      {m.actor_name ? ` · ${m.actor_name}` : ""}
                    </p>
                    {m.reason && <p className="text-xs text-muted-foreground">{m.reason}</p>}
                    <p className="text-[11px] text-muted-foreground">{dateTimeBR(m.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-display text-sm font-bold ${
                        m.quantity_delta < 0 ? "text-destructive" : "text-success"
                      }`}
                    >
                      {m.quantity_delta > 0 ? "+" : ""}
                      {m.quantity_delta}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {m.stock_before} → {m.stock_after}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <GhostButton onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</GhostButton>
            <span className="text-xs text-muted-foreground">Página {page + 1}</span>
            <GhostButton
              onClick={() =>
                setPage((p) => ((history.data ?? []).length === PAGE_SIZE ? p + 1 : p))
              }
            >
              Próxima
            </GhostButton>
          </div>
        </>
      )}
    </AdminPage>
  );
}
