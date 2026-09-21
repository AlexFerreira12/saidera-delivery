import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { CartBar } from "@/components/CartBar";

export function AppShell({
  children,
  hideCartBar = false,
  hideNav = false,
}: {
  children: ReactNode;
  hideCartBar?: boolean;
  hideNav?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-2xl">{children}</div>
      {!hideCartBar && <CartBar offsetNav={!hideNav} />}
      {!hideNav && <BottomNav />}
    </div>
  );
}

export function PageHeader({
  title,
  backTo = "/",
  action,
}: {
  title: string;
  backTo?: string;
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-card/95 px-3 py-3 backdrop-blur">
      <Link
        to={backTo}
        className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-secondary-foreground"
        aria-label="Voltar"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <h1 className="flex-1 truncate font-display text-lg font-bold">{title}</h1>
      {action}
    </header>
  );
}
