import { useCallback, useEffect, useRef, useState } from "react";

type PromptRequest = {
  title: string;
  description?: string;
  placeholder?: string;
  confirmLabel?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
};

type Pending = PromptRequest & { resolve: (value: string | null) => void };

/**
 * Substitui window.prompt por um diálogo acessível (foco preso, Esc fecha,
 * rótulos e aria corretos). Retorna o texto informado ou null se cancelado.
 */
export function useAdminPrompt() {
  const [pending, setPending] = useState<Pending | null>(null);

  const ask = useCallback(
    (request: PromptRequest) =>
      new Promise<string | null>((resolve) => setPending({ ...request, resolve })),
    [],
  );

  const dialog = pending ? (
    <PromptDialog
      request={pending}
      onClose={(value) => {
        pending.resolve(value);
        setPending(null);
      }}
    />
  ) : null;

  return { ask, dialog };
}

function PromptDialog({
  request,
  onClose,
}: {
  request: PromptRequest;
  onClose: (value: string | null) => void;
}) {
  const [value, setValue] = useState(request.options?.[0]?.value ?? "");
  const fieldRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    fieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (request.required && !text) return;
    onClose(text);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(null);
      }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-title"
        className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-4 shadow-lg"
      >
        <h2 id="prompt-title" className="font-display text-base font-extrabold">
          {request.title}
        </h2>
        {request.description ? (
          <p className="text-xs text-muted-foreground">{request.description}</p>
        ) : null}

        <label className="block text-xs font-semibold text-muted-foreground">
          {request.options ? "Escolha uma opção" : "Informe o texto"}
          {request.options ? (
            <select
              ref={fieldRef as React.RefObject<HTMLSelectElement>}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {request.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              ref={fieldRef as React.RefObject<HTMLInputElement>}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={request.placeholder}
              className="mt-1 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          )}
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(null)}
            className="min-h-11 rounded-xl border border-border px-4 text-sm font-bold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            {request.confirmLabel ?? "Confirmar"}
          </button>
        </div>
      </form>
    </div>
  );
}
