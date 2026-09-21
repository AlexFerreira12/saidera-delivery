import type { ReactNode } from "react";

export function AdminPage({ children }: { children: ReactNode }) {
  return <div className="space-y-4 p-4">{children}</div>;
}

export function AdminHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="font-display text-base font-extrabold">{title}</h1>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`surface-card space-y-2 p-4 ${className}`}>{children}</div>;
}

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-xs font-semibold text-muted-foreground ${className}`}>
      {label}
      <div className="mt-1 font-normal text-foreground">{children}</div>
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none";

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type === "submit" ? "submit" : "button"}
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-60 ${
        danger ? "text-destructive" : "text-foreground"
      }`}
    >
      {children}
    </button>
  );
}


export function StatusPill({ active, onClick }: { active: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
        active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
      }`}
    >
      {active ? "Ativo" : "Inativo"}
    </button>
  );
}

export function StateBlock({
  loading,
  error,
  empty,
  emptyText,
}: {
  loading?: boolean;
  error?: unknown;
  empty?: boolean;
  emptyText: string;
}) {
  if (loading)
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando...</p>;
  if (error)
    return (
      <p className="py-10 text-center text-sm text-destructive">
        Não foi possível carregar os dados. Tente novamente.
      </p>
    );
  if (empty) return <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return null;
}
