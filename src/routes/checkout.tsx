import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { brl } from "@/lib/format";
import { checkoutErrorMessage, COUPON_STORAGE_KEY } from "@/lib/checkout";
import { fetchAddresses, useZones, type Address } from "@/routes/enderecos";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Finalizar pedido — Bebidas Guariba" },
      {
        name: "description",
        content: "Escolha endereço, pagamento e confirme sua entrega em Guariba/SP.",
      },
      { property: "og:title", content: "Finalizar pedido — Bebidas Guariba" },
      {
        property: "og:description",
        content: "Endereço, pagamento e confirmação em poucos toques.",
      },
    ],
  }),
  component: CheckoutPage,
});

const PAYMENTS = [
  { id: "pix", label: "PIX", hint: "Indisponível — integração pendente", disabled: true },
  { id: "dinheiro", label: "Dinheiro na entrega", hint: "Informe o troco", disabled: false },
  { id: "cartao_entrega", label: "Cartão na entrega", hint: "Débito ou crédito", disabled: false },
] as const;

function CheckoutPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const cart = useCart();
  const zones = useZones();

  const [addressId, setAddressId] = useState<string | null>(null);
  const [payment, setPayment] = useState<string>("dinheiro");
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [coupon, setCoupon] = useState<string | null>(null);

  useEffect(() => {
    setCoupon(localStorage.getItem(COUPON_STORAGE_KEY));
  }, []);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const { data: addresses } = useQuery({
    queryKey: ["addresses"],
    queryFn: fetchAddresses,
    enabled: !!session,
  });

  useEffect(() => {
    if (!addressId && addresses?.length) {
      const first = addresses.find((a) => a.is_default) ?? addresses[0];
      if (first) setAddressId(first.id);
    }
  }, [addresses, addressId]);

  const address = useMemo<Address | undefined>(
    () => addresses?.find((a) => a.id === addressId),
    [addresses, addressId],
  );
  const zone = zones.data?.find((z) => z.neighborhood === address?.neighborhood);
  const deliveryFee = zone ? Number(zone.fee) : 0;
  const total = cart.subtotal + deliveryFee;

  const placeOrder = async () => {
    if (!address) {
      toast.error("Selecione um endereço de entrega.");
      return;
    }
    if (cart.items.length === 0) {
      toast.error("Seu carrinho está vazio.");
      return;
    }
    setPlacing(true);
    try {
      const trimmedNotes = notes.trim();
      const trimmedChange = payment === "dinheiro" ? changeFor.trim() : "";
      const { data, error } = await supabase.rpc("create_order", {
        p_address_id: address.id,
        p_payment_method: payment,
        p_items: cart.items.map((item) => ({ product_id: item.id, quantity: item.quantity })),
        ...(trimmedNotes ? { p_notes: trimmedNotes } : {}),
        ...(trimmedChange ? { p_change_for: trimmedChange } : {}),
        ...(coupon ? { p_coupon_code: coupon } : {}),
      });

      if (error) throw error;

      const result = data as { order_id: string; total: number };
      cart.clear();
      localStorage.removeItem(COUPON_STORAGE_KEY);
      toast.success(`Pedido confirmado! Total ${brl(Number(result.total))}`);
      void navigate({ to: "/pedido/$id", params: { id: result.order_id } });
    } catch (err) {
      toast.error(checkoutErrorMessage(err));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <AppShell hideNav hideCartBar>
      <PageHeader title="Finalizar pedido" />
      <div className="space-y-4 p-4 pb-28">
        <section className="surface-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-bold">Entrega</h2>
            <Link to="/enderecos" className="text-xs font-semibold text-primary">
              Gerenciar
            </Link>
          </div>
          {addresses?.length ? (
            <div className="space-y-2">
              {addresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAddressId(a.id)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left ${
                    a.id === addressId ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                  <span className="text-sm">
                    <span className="block font-semibold">{a.label}</span>
                    <span className="text-muted-foreground">
                      {a.street}, {a.number} — {a.neighborhood}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Link to="/enderecos" className="text-sm font-semibold text-primary">
              + Cadastrar endereço de entrega
            </Link>
          )}
          {zone && (
            <p className="mt-3 text-xs text-muted-foreground">
              Entrega em ~{zone.eta_minutes} min · taxa {brl(Number(zone.fee))} · mínimo{" "}
              {brl(Number(zone.min_order))}
            </p>
          )}
        </section>

        <section className="surface-card p-4">
          <h2 className="mb-3 font-display text-sm font-bold">Pagamento</h2>
          <div className="space-y-2">
            {PAYMENTS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={p.disabled}
                onClick={() => !p.disabled && setPayment(p.id)}
                className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm ${
                  payment === p.id ? "border-primary bg-primary/5" : "border-border"
                } ${p.disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <span className="font-semibold">{p.label}</span>
                <span className="text-xs text-muted-foreground">{p.hint}</span>
              </button>
            ))}
          </div>
          {payment === "dinheiro" && (
            <input
              value={changeFor}
              onChange={(e) => setChangeFor(e.target.value)}
              placeholder="Troco para quanto? Ex: R$ 100"
              className="mt-3 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
            />
          )}
        </section>

        <section className="surface-card p-4">
          <h2 className="mb-2 font-display text-sm font-bold">Observações</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Ex: entregar bem gelado, portão azul..."
            className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none"
          />
        </section>

        <section className="surface-card space-y-2 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-semibold">{brl(cart.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Taxa de entrega</span>
            <span className="font-semibold">{deliveryFee ? brl(deliveryFee) : "—"}</span>
          </div>
          {coupon && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cupom {coupon}</span>
              <span className="font-semibold">validado na confirmação</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 font-display text-base font-bold">
            <span>Total estimado</span>
            <span>{brl(total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Os valores finais são calculados e confirmados no momento do pedido.
          </p>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 py-3">
        <button
          type="button"
          onClick={placeOrder}
          disabled={placing}
          className="mx-auto block w-full max-w-2xl rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {placing ? "Enviando..." : `CONFIRMAR PEDIDO • ${brl(total)}`}
        </button>
      </div>
    </AppShell>
  );
}
