import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { brl } from "@/lib/format";
import { GUARIBA_FLAT_DELIVERY_FEE, isGuaribaCityAddress } from "@/lib/delivery-policy";
import { fetchStoreSettings } from "@/lib/catalog";
import { checkoutErrorMessage, COUPON_STORAGE_KEY } from "@/lib/checkout";
import { fetchAddresses, type Address } from "@/lib/addresses";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
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
  { id: "pix", label: "PIX", hint: "Pague na hora pelo app", disabled: false },
  { id: "dinheiro", label: "Dinheiro na entrega", hint: "Informe o troco", disabled: false },
  { id: "cartao_entrega", label: "Cartão na entrega", hint: "Débito ou crédito", disabled: false },
] as const;

function CheckoutPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const cart = useCart();
  const { data: store } = useQuery({ queryKey: ["store-settings"], queryFn: fetchStoreSettings });
  const [addressId, setAddressId] = useState<string | null>(null);
  const [payment, setPayment] = useState<string>("dinheiro");
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [coupon, setCoupon] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const requestFingerprintRef = useRef<string | null>(null);

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
  const eligibility = useQuery({
    queryKey: ["delivery-eligibility", address?.id],
    enabled: !!address?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "delivery_address_eligibility" as never,
        { p_address_id: address!.id } as never,
      );
      if (error) throw error;
      return data as unknown as "inside" | "override" | "pending" | "outside" | "invalid";
    },
  });
  const deliveryEligible = eligibility.data === "inside" || eligibility.data === "override";
  // This branch must only be deployed together with the delivery eligibility backend migration.
  const deliveryFee =
    deliveryEligible && store
      ? Number(store.default_delivery_fee ?? GUARIBA_FLAT_DELIVERY_FEE)
      : null;
  const freeShipping =
    deliveryFee !== null &&
    Number(store?.free_delivery_above ?? 0) > 0 &&
    cart.subtotal >= Number(store?.free_delivery_above);
  const effectiveFee = freeShipping ? 0 : deliveryFee;
  const total = effectiveFee === null ? null : cart.subtotal + effectiveFee;

  const placeOrder = async () => {
    if (!address) {
      toast.error("Selecione um endereço de entrega.");
      return;
    }
    if (!isGuaribaCityAddress(address)) {
      toast.error("Por enquanto, entregamos apenas em Guariba/SP.");
      return;
    }
    if (deliveryFee === null) {
      toast.error("Endereço aguardando validação da área de entrega. Entre em contato com a loja.");
      return;
    }
    if (cart.items.length === 0) {
      toast.error("Seu carrinho está vazio.");
      return;
    }
    if (placing) return;
    setPlacing(true);
    try {
      const trimmedNotes = notes.trim();
      const trimmedChange = payment === "dinheiro" ? changeFor.trim() : "";
      const requestFingerprint = JSON.stringify({
        addressId: address.id,
        payment,
        items: cart.items
          .map((item) => [item.id, item.quantity])
          .sort(([a], [b]) => String(a).localeCompare(String(b))),
        notes: trimmedNotes,
        changeFor: trimmedChange,
        coupon,
      });
      if (!requestIdRef.current || requestFingerprintRef.current !== requestFingerprint) {
        requestIdRef.current = crypto.randomUUID();
        requestFingerprintRef.current = requestFingerprint;
      }
      const requestId = requestIdRef.current;
      const { data, error } = await supabase.rpc("create_order", {
        p_address_id: address.id,
        p_payment_method: payment,
        p_items: cart.items.map((item) => ({ product_id: item.id, quantity: item.quantity })),
        p_client_request_id: requestId,
        ...(trimmedNotes ? { p_notes: trimmedNotes } : {}),
        ...(trimmedChange ? { p_change_for: trimmedChange } : {}),
        ...(coupon ? { p_coupon_code: coupon } : {}),
      });

      if (error) throw error;

      const result = data as unknown as {
        order_id: string;
        total: number;
        requires_online_payment?: boolean;
      };
      requestIdRef.current = null;
      requestFingerprintRef.current = null;
      cart.clear();
      localStorage.removeItem(COUPON_STORAGE_KEY);
      if (result.requires_online_payment) {
        void navigate({ to: "/pagamento/$id", params: { id: result.order_id } });
      } else {
        toast.success(`Pedido confirmado! Total ${brl(Number(result.total))}`);
        void navigate({ to: "/pedido/$id", params: { id: result.order_id } });
      }
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
          {address && eligibility.isLoading && (
            <p className="mt-3 text-xs text-muted-foreground">Verificando área de entrega...</p>
          )}
          {address && eligibility.data === "pending" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Localização em análise. A loja pode aprovar manualmente loteamentos novos.
            </p>
          )}
          {address && eligibility.data === "outside" && (
            <p className="mt-3 text-xs text-destructive">Este endereço está fora de Guariba/SP.</p>
          )}
          {address && eligibility.data === "invalid" && (
            <p className="mt-3 text-xs text-destructive">Endereço inválido. Revise o cadastro.</p>
          )}
          {address && eligibility.isError && (
            <p className="mt-3 text-xs text-destructive">
              Não foi possível verificar a área de entrega.
            </p>
          )}
          {deliveryEligible && store && (
            <p className="mt-3 text-xs text-muted-foreground">
              Entrega em ~{store.avg_delivery_minutes} min · taxa{" "}
              {brl(Number(store.default_delivery_fee))} · pedido mínimo{" "}
              {brl(Number(store.min_order))}
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
            <span className="font-semibold">
              {effectiveFee === null ? "A confirmar" : brl(effectiveFee)}
            </span>
          </div>
          {coupon && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cupom {coupon}</span>
              <span className="font-semibold">validado na confirmação</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 font-display text-base font-bold">
            <span>Total estimado</span>
            <span>{total === null ? "A confirmar" : brl(total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Os valores finais são calculados e confirmados no momento do pedido.
          </p>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 safe-bottom border-t border-border bg-card px-4 pt-3">
        <button
          type="button"
          onClick={placeOrder}
          disabled={placing || deliveryFee === null}
          className="mx-auto block w-full max-w-2xl rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {placing
            ? "Enviando..."
            : total === null
              ? "ENTREGA A CONFIRMAR"
              : `CONFIRMAR PEDIDO • ${brl(total)}`}
        </button>
      </div>
    </AppShell>
  );
}
