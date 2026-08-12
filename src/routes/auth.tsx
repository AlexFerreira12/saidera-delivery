import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { maskCPF, maskPhone, isValidPhone, isValidCPF } from "@/lib/format";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar ou criar conta — Bebidas Guariba" },
      { name: "description", content: "Acesse sua conta para pedir bebidas com entrega rápida em Guariba/SP." },
      { property: "og:title", content: "Entrar — Bebidas Guariba" },
      { property: "og:description", content: "Crie sua conta e peça em poucos toques." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ full_name: "", cpf: "", phone: "", email: "", password: "" });

  useEffect(() => {
    if (session) void navigate({ to: "/" });
  }, [session, navigate]);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!form.full_name.trim()) { toast.error("Informe seu nome completo."); return; }
        if (!isValidCPF(form.cpf)) { toast.error("CPF inválido."); return; }
        if (!isValidPhone(form.phone)) { toast.error("Telefone inválido."); return; }
        if (form.password.length < 6) { toast.error("A senha precisa ter ao menos 6 caracteres."); return; }
        const { error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: form.full_name, cpf: form.cpf, phone: form.phone },
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Bem-vindo.");
        void navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email.trim(),
          password: form.password,
        });
        if (error) throw error;
        void navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível continuar.");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) { toast.error("Não foi possível entrar com Google."); return; }
    if (result.redirected) return;
    void navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto max-w-md">
        <Link to="/" className="text-sm text-muted-foreground">
          ← Voltar
        </Link>
        <h1 className="mt-6 font-display text-2xl font-extrabold">
          {mode === "login" ? "Entrar na sua conta" : "Criar conta"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Bebidas geladas entregues em Guariba/SP.</p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          {mode === "signup" && (
            <>
              <Field label="Nome completo" value={form.full_name} onChange={(v) => set("full_name", v)} />
              <Field label="CPF" value={form.cpf} onChange={(v) => set("cpf", maskCPF(v))} inputMode="numeric" />
              <Field label="Telefone" value={form.phone} onChange={(v) => set("phone", maskPhone(v))} inputMode="tel" />
            </>
          )}
          <Field label="E-mail" type="email" value={form.email} onChange={(v) => set("email", v)} />
          <Field label="Senha" type="password" value={form.password} onChange={(v) => set("password", v)} />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {loading ? "Aguarde..." : mode === "login" ? "ENTRAR" : "CRIAR CONTA"}
          </button>
        </form>

        <button
          type="button"
          onClick={google}
          className="mt-3 w-full rounded-2xl border border-border bg-card py-3 text-sm font-semibold"
        >
          Continuar com Google
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-4 w-full text-center text-sm text-muted-foreground"
        >
          {mode === "login" ? "Não tem conta? Cadastre-se" : "Já tenho conta. Entrar"}
        </button>
        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Login por telefone/OTP e Apple ficarão disponíveis em breve.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: "numeric" | "tel";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-ring"
      />
    </label>
  );
}
