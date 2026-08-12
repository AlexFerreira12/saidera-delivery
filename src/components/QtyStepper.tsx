import { Minus, Plus } from "lucide-react";

export function QtyStepper({
  quantity,
  onIncrement,
  onDecrement,
  size = "md",
}: {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  size?: "sm" | "md";
}) {
  const btn =
    size === "sm"
      ? "h-8 w-8 rounded-lg text-primary-foreground"
      : "h-10 w-10 rounded-xl text-primary-foreground";
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-primary p-1">
      <button
        type="button"
        aria-label="Diminuir quantidade"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDecrement();
        }}
        className={`${btn} grid place-items-center transition-opacity hover:opacity-80`}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-6 text-center text-sm font-bold text-primary-foreground">{quantity}</span>
      <button
        type="button"
        aria-label="Aumentar quantidade"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onIncrement();
        }}
        className={`${btn} grid place-items-center transition-opacity hover:opacity-80`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
