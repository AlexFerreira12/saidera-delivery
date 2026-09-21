import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { fetchCategories, fetchAdminProducts, type AdminProduct } from "@/lib/catalog";
import { brl } from "@/lib/format";
import { stockEntry, stockErrorMessage } from "@/lib/stock";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { applyProductImage, previewProductImage } from "@/lib/product-image.functions";
import { isValidGtin, normalizeGtin } from "@/lib/gtin";
import type { ImageCandidate, ImageSearchResult } from "@/lib/product-image-types";

export const Route = createFileRoute("/admin/produtos")({
  component: AdminProducts,
});

type ImageSearchState = {
  product: AdminProduct;
  phase: "loading" | "ready" | "applying";
  result: ImageSearchResult | null;
};

type BatchSummary = { applied: number; notFound: number; invalidGtin: number; errors: number };
type BatchState = {
  running: boolean;
  current: number;
  total: number;
  summary: BatchSummary | null;
};

function imageSearchMessage(result: ImageSearchResult): string {
  switch (result.status) {
    case "invalid_gtin":
      return "Este produto não tem um código de barras (GTIN/EAN) válido cadastrado.";
    case "not_found":
      return "Nenhum produto encontrado para este código no Open Food Facts.";
    case "gtin_mismatch":
      return "O código retornado não confere exatamente com o cadastrado. Busca rejeitada por segurança.";
    case "no_image":
      return "Produto encontrado, mas sem imagem disponível na fonte.";
    case "error":
      return "Não foi possível buscar a imagem agora. Tente novamente.";
    default:
      return "";
  }
}

function AdminProducts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [imageSearch, setImageSearch] = useState<ImageSearchState | null>(null);
  const [batch, setBatch] = useState<BatchState>({
    running: false,
    current: 0,
    total: 0,
    summary: null,
  });
  const [form, setForm] = useState({
    name: "",
    price: "",
    stock: "",
    category_id: "",
    volume: "",
    barcode: "",
    image_url: "",
  });
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    price: "",
    category_id: "",
    volume: "",
    barcode: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const previewImage = useServerFn(previewProductImage);
  const applyImage = useServerFn(applyProductImage);

  const { data: products } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: fetchAdminProducts,
  });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "products"] });

  const patch = async (id: string, values: { price?: number; is_active?: boolean }) => {
    const { error } = await supabase.from("products").update(values).eq("id", id);
    if (error) toast.error("Não foi possível salvar.");
    else void refresh();
  };

  const openEdit = (p: AdminProduct) => {
    setEditForm({
      name: p.name,
      price: String(Number(p.price)),
      category_id: p.category_id ?? "",
      volume: p.volume ?? "",
      barcode: p.barcode ?? "",
    });
    setEditing(p);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || savingEdit) return;
    if (!editForm.name.trim() || !editForm.price) {
      toast.error("Informe nome e preço.");
      return;
    }
    // Preserva zeros à esquerda; remove apenas espaços/separadores acidentais.
    const barcode = normalizeGtin(editForm.barcode);
    if (barcode && !isValidGtin(barcode)) {
      toast.error("Código de barras inválido: confira os dígitos (o verificador não confere).");
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase
      .from("products")
      .update({
        name: editForm.name.trim(),
        price: Number(editForm.price),
        volume: editForm.volume.trim() || null,
        category_id: editForm.category_id || null,
        barcode: barcode || null,
      })
      .eq("id", editing.id);
    setSavingEdit(false);
    if (error) {
      toast.error("Não foi possível salvar as alterações.");
      return;
    }
    toast.success("Produto atualizado!");
    setEditing(null);
    void refresh();
  };

  const openImageSearch = async (product: AdminProduct) => {
    setImageSearch({ product, phase: "loading", result: null });
    try {
      const result = await previewImage({ data: { productId: product.id } });
      setImageSearch((current) =>
        current?.product.id === product.id ? { ...current, phase: "ready", result } : current,
      );
    } catch {
      setImageSearch((current) =>
        current?.product.id === product.id
          ? { ...current, phase: "ready", result: { status: "error", message: "FALHA" } }
          : current,
      );
    }
  };

  const confirmImageSearch = async () => {
    if (!imageSearch || imageSearch.result?.status !== "found") return;
    const productId = imageSearch.product.id;
    setImageSearch({ ...imageSearch, phase: "applying" });
    try {
      const result = await applyImage({ data: { productId, allowReplace: true } });
      if (result.status === "applied") {
        toast.success("Imagem aplicada!");
        setImageSearch(null);
        void refresh();
      } else if (result.status === "has_image") {
        setImageSearch(null);
      } else {
        setImageSearch({ product: imageSearch.product, phase: "ready", result });
      }
    } catch {
      setImageSearch({
        product: imageSearch.product,
        phase: "ready",
        result: { status: "error", message: "FALHA" },
      });
    }
  };

  const runBatch = async () => {
    const list = (products ?? []) as AdminProduct[];
    const noImage = list.filter((p) => !p.image_url);
    if (noImage.length === 0) {
      toast.info("Todos os produtos já têm imagem.");
      return;
    }
    const invalidCount = noImage.filter((p) => !isValidGtin(p.barcode)).length;
    const eligible = noImage.filter((p) => isValidGtin(p.barcode));
    if (eligible.length === 0) {
      setBatch({
        running: false,
        current: 0,
        total: 0,
        summary: { applied: 0, notFound: 0, invalidGtin: invalidCount, errors: 0 },
      });
      return;
    }

    setBatch({ running: true, current: 0, total: eligible.length, summary: null });
    const summary: BatchSummary = { applied: 0, notFound: 0, invalidGtin: invalidCount, errors: 0 };
    for (const [index, product] of eligible.entries()) {
      setBatch((b) => ({ ...b, current: index + 1 }));
      try {
        const result = await applyImage({ data: { productId: product.id, allowReplace: false } });
        if (result.status === "applied") summary.applied++;
        else if (result.status === "invalid_gtin") summary.invalidGtin++;
        else if (result.status === "error") summary.errors++;
        else if (result.status !== "has_image") summary.notFound++;
      } catch {
        summary.errors++;
      }
      // Intervalo entre chamadas para não abusar da API pública.
      if (index < eligible.length - 1) await new Promise((r) => setTimeout(r, 400));
    }
    setBatch({ running: false, current: eligible.length, total: eligible.length, summary });
    void refresh();
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.price) {
      toast.error("Informe nome e preço.");
      return;
    }
    const barcode = form.barcode.trim();
    if (barcode && !isValidGtin(barcode)) {
      toast.error("Código de barras inválido: confira os dígitos (o verificador não confere).");
      return;
    }
    const initialStock = Number(form.stock || 0);
    const { data, error } = await supabase
      .from("products")
      .insert({
        name: form.name,
        slug: form.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        price: Number(form.price),
        stock: 0,
        volume: form.volume || null,
        barcode: barcode || null,
        image_url: form.image_url || null,
        category_id: form.category_id || null,
      })
      .select("id")
      .single();
    if (error || !data) {
      toast.error("Não foi possível criar o produto.");
      return;
    }
    if (initialStock > 0) {
      try {
        await stockEntry(data.id, initialStock, "Estoque inicial do cadastro");
      } catch (err) {
        toast.error(stockErrorMessage(err, "Produto criado, mas o estoque inicial falhou."));
      }
    }
    toast.success("Produto criado!");
    setForm({
      name: "",
      price: "",
      stock: "",
      category_id: "",
      volume: "",
      barcode: "",
      image_url: "",
    });
    setCreating(false);
    void refresh();
    void qc.invalidateQueries({ queryKey: ["admin", "stock"] });
  };

  const list = ((products ?? []) as AdminProduct[]).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar produto"
          className="flex-1 rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => void runBatch()}
          disabled={batch.running}
          className="min-h-11 rounded-xl border border-input bg-card px-3 text-sm font-bold disabled:opacity-50"
        >
          {batch.running ? `Buscando ${batch.current}/${batch.total}` : "Buscar imagens"}
        </button>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          {creating ? "Fechar" : "Novo"}
        </button>
      </div>

      {batch.running && (
        <p className="surface-card p-3 text-xs text-muted-foreground" role="status">
          Buscando imagens automaticamente… {batch.current}/{batch.total}. Produtos sem código de
          barras válido serão listados no resumo.
        </p>
      )}

      {creating && (
        <form onSubmit={create} className="surface-card space-y-3 p-4">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nome do produto"
            className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              inputMode="decimal"
              placeholder="Preço"
              className="rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
            />
            <input
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
              inputMode="numeric"
              placeholder="Estoque"
              className="rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
            />
            <input
              value={form.volume}
              onChange={(e) => setForm({ ...form, volume: e.target.value })}
              placeholder="Volume"
              className="rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
            />
          </div>
          <input
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value.replace(/\D/g, "") })}
            inputMode="numeric"
            placeholder="Código de barras (EAN/GTIN)"
            aria-label="Código de barras do produto"
            className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
          />
          <select
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
          >
            <option value="">Categoria</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ImageUpload
            folder="produtos"
            value={form.image_url}
            onChange={(url) => setForm({ ...form, image_url: url })}
            label="Foto do produto"
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground"
          >
            CRIAR PRODUTO
          </button>
        </form>
      )}

      <div className="space-y-2">
        {list.map((p) => (
          <div key={p.id} className="surface-card flex items-center gap-3 p-3">
            {p.image_url ? (
              <img
                src={p.image_url}
                alt=""
                loading="lazy"
                className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {brl(p.price)} · {p.categories?.name ?? "sem categoria"}
                {p.stock <= p.min_stock && (
                  <span className="ml-1 font-bold text-destructive">estoque baixo</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void openImageSearch(p)}
              aria-label={
                p.image_url ? `Substituir imagem de ${p.name}` : `Buscar imagem de ${p.name}`
              }
              title={p.image_url ? "Substituir imagem" : "Buscar imagem"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-input bg-muted text-muted-foreground"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.5-3.5a2 2 0 0 0-3 0L6 20" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => openEdit(p)}
              aria-label={`Editar ${p.name}`}
              title="Editar produto"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-input bg-muted text-muted-foreground"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </button>
            <Link
              to="/admin/estoque"
              className="w-16 rounded-lg border border-input bg-muted px-2 py-1 text-center text-sm font-semibold"
              aria-label={`Estoque de ${p.name}: ${p.stock}. Abrir tela de estoque`}
            >
              {p.stock}
            </Link>

            <input
              type="number"
              step="0.01"
              defaultValue={Number(p.price)}
              onBlur={(e) => patch(p.id, { price: Number(e.target.value) })}
              className="w-20 rounded-lg border border-input bg-card px-2 py-1 text-center text-sm outline-none"
              aria-label={`Preço de ${p.name}`}
            />
            <button
              type="button"
              onClick={() => patch(p.id, { is_active: !p.is_active })}
              className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                p.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
              }`}
            >
              {p.is_active ? "Ativo" : "Inativo"}
            </button>
          </div>
        ))}
      </div>

      {imageSearch && (
        <ImageSearchDialog
          state={imageSearch}
          onCancel={() => setImageSearch(null)}
          onConfirm={() => void confirmImageSearch()}
        />
      )}

      {editing && (
        <EditProductDialog
          product={editing}
          form={editForm}
          saving={savingEdit}
          categories={categories ?? []}
          onChange={setEditForm}
          onCancel={() => setEditing(null)}
          onSubmit={saveEdit}
        />
      )}

      {batch.summary && (
        <BatchSummaryDialog
          summary={batch.summary}
          onClose={() => setBatch((b) => ({ ...b, summary: null }))}
        />
      )}
    </div>
  );
}

function candidateLines(candidate: ImageCandidate): string {
  return [candidate.name, candidate.brand].filter(Boolean).join(" · ");
}

function ImageSearchDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: ImageSearchState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.phase !== "applying") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, state.phase]);

  const { result } = state;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && state.phase !== "applying") onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-search-title"
        className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-4 shadow-lg"
      >
        <h2 id="image-search-title" className="font-display text-base font-extrabold">
          Imagem de {state.product.name}
        </h2>

        {state.phase === "loading" && (
          <p className="text-xs text-muted-foreground">Buscando imagem no Open Food Facts…</p>
        )}

        {state.phase !== "loading" && result?.status === "found" && (
          <div className="space-y-2">
            <img
              src={result.candidate.imageUrl ?? ""}
              alt={result.candidate.name ?? "Imagem encontrada"}
              className="mx-auto h-32 w-32 rounded-xl border border-border bg-card object-contain"
            />
            <p className="text-center text-xs text-muted-foreground">
              {candidateLines(result.candidate) || "Sem nome na fonte"}
              <br />
              Fonte: Open Food Facts · GTIN {result.candidate.gtin}
            </p>
            {state.product.image_url ? (
              <p className="text-center text-[11px] font-semibold text-warning">
                Isso substituirá a imagem atual.
              </p>
            ) : null}
            {state.phase === "applying" ? (
              <p className="text-center text-xs text-muted-foreground">Aplicando imagem…</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                ref={closeRef}
                type="button"
                onClick={onCancel}
                disabled={state.phase === "applying"}
                className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={state.phase === "applying"}
                className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                Usar imagem
              </button>
            </div>
          </div>
        )}

        {state.phase !== "loading" && result && result.status !== "found" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{imageSearchMessage(result)}</p>
            {result.status === "no_image" && (
              <p className="text-xs text-muted-foreground">
                {candidateLines(result.candidate) || "Produto identificado na fonte."}
              </p>
            )}
            <div className="flex justify-end">
              <button
                ref={closeRef}
                type="button"
                onClick={onCancel}
                className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BatchSummaryDialog({ summary, onClose }: { summary: BatchSummary; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-summary-title"
        className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-4 shadow-lg"
      >
        <h2 id="batch-summary-title" className="font-display text-base font-extrabold">
          Busca automática concluída
        </h2>
        <ul className="space-y-1 text-sm">
          <li>
            <strong>{summary.applied}</strong> imagem(ns) aplicada(s)
          </li>
          <li>
            <strong>{summary.notFound}</strong> não encontrada(s)
          </li>
          <li>
            <strong>{summary.invalidGtin}</strong> sem código de barras válido
          </li>
          <li>
            <strong>{summary.errors}</strong> erro(s)
          </li>
        </ul>
        <div className="flex justify-end">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
