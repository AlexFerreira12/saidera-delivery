import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { uploadCatalogImage } from "@/lib/uploads.functions";

const MESSAGES: Record<string, string> = {
  TIPO_INVALIDO: "Use uma imagem JPG, PNG ou WebP.",
  ARQUIVO_GRANDE: "A imagem precisa ter no máximo 3 MB.",
  ARQUIVO_VAZIO: "O arquivo está vazio.",
  SEM_PERMISSAO: "Você não tem permissão para enviar imagens.",
};

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("LEITURA_FALHOU"));
    reader.readAsDataURL(file);
  });
}

export function ImageUpload({
  folder,
  value,
  onChange,
  label = "Imagem",
}: {
  folder: "produtos" | "banners";
  value: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const upload = useServerFn(uploadCatalogImage);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  const pick = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const dataBase64 = await toBase64(file);
      const res = await upload({ data: { folder, contentType: file.type, dataBase64 } });
      onChange(res.url);
      toast.success("Imagem enviada!");
    } catch (err) {
      const code = err instanceof Error ? err.message.replace(/^Error:\s*/, "") : "";
      toast.error(MESSAGES[code] ?? "Não foi possível enviar a imagem.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor={fieldId} className="block text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-3">
        {value ? (
          <img
            src={value}
            alt="Pré-visualização da imagem"
            loading="lazy"
            className="h-14 w-14 rounded-xl border border-border object-cover"
          />
        ) : null}
        <input
          id={fieldId}
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => void pick(e.target.files?.[0])}
          className="block w-full text-xs text-muted-foreground file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-muted file:px-3 file:py-2 file:text-xs file:font-bold file:text-foreground"
        />
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ou cole um endereço de imagem"
        aria-label="Endereço da imagem"
        className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none"
      />
      {busy ? <p className="text-xs text-muted-foreground">Enviando imagem…</p> : null}
    </div>
  );
}
