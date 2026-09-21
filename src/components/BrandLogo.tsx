import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Logo oficial SAIDERA.
 *
 * Fonte primária: bucket Storage `catalogo`, objeto `branding/saidera-logo.png`,
 * servido pela rota pública `/api/public/imagem/branding/saidera-logo.png`
 * (bucket privado; leitura pública apenas dessa rota, escrita admin-only).
 * Basta enviar o PNG nesse caminho do Storage — nenhuma alteração de código
 * é necessária (cache de até 5 min).
 *
 * Fallbacks, em ordem: arquivo local `public/branding/saidera-logo.png`
 * (se existir no deploy) e, por fim, wordmark temporário em sans.
 *
 * Não aplicar filtros CSS (invert/brightness/contrast) sobre a imagem:
 * a arte oficial já é grafite + dourado e não deve ser alterada pelo tema.
 */

const STORAGE_URL = "/api/public/imagem/branding/saidera-logo.png";
const LOCAL_URL = "/branding/saidera-logo.png";

const SIZES = {
  /** ~40px — uso futuro em rodapés, recibos e áreas compactas. */
  sm: "h-10",
  /** ~48px — cabeçalho mobile (altura alvo 46–60px). */
  md: "h-12",
  /** ~60px — destaque/emblema maior. */
  lg: "h-[60px]",
} as const;

const FALLBACK_TEXT_SIZES = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-2xl",
} as const;

type SourceStage = "storage" | "local" | "missing";

export interface BrandLogoProps {
  size?: keyof typeof SIZES;
  /**
   * "on-dark" = sobre bloco grafite/preto (cabeçalho da Home).
   * "on-light" = sobre fundo claro. Reservado para quando houver
   * variante oficial da arte para fundo claro; hoje ambos apontam
   * para o mesmo arquivo.
   */
  variant?: "on-dark" | "on-light";
  /** No fallback de texto, exibe "Adega e Distribuidora" abaixo do nome. */
  withTagline?: boolean;
  className?: string;
}

export function BrandLogo({
  size = "md",
  variant = "on-dark",
  withTagline = false,
  className,
}: BrandLogoProps) {
  const [stage, setStage] = useState<SourceStage>("storage");
  const imgRef = useRef<HTMLImageElement>(null);

  const advance = useCallback(() => {
    setStage((s) => (s === "storage" ? "local" : "missing"));
  }, []);

  // Com SSR, o erro de carregamento pode acontecer antes da hidratação
  // anexar o onError — confere o estado real da imagem após montar.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      advance();
    }
  }, [stage, advance]);

  if (stage === "missing") {
    // Fallback discreto: wordmark sans temporário (não é o logo oficial).
    return (
      <span className={cn("inline-flex flex-col", className)}>
        <span
          className={cn(
            "font-extrabold tracking-[0.22em]",
            variant === "on-dark" ? "text-accent" : "text-foreground",
            FALLBACK_TEXT_SIZES[size],
          )}
        >
          SAIDERA
        </span>
        {withTagline && (
          <span
            className={cn(
              "mt-0.5 text-[10px] font-semibold uppercase tracking-[0.3em]",
              variant === "on-dark" ? "text-primary-foreground/55" : "text-muted-foreground",
            )}
          >
            Adega e Distribuidora
          </span>
        )}
      </span>
    );
  }

  return (
    <img
      ref={imgRef}
      src={stage === "storage" ? STORAGE_URL : LOCAL_URL}
      alt="SAIDERA — Adega e Distribuidora"
      className={cn("w-auto max-w-[240px] shrink-0 object-contain", SIZES[size], className)}
      decoding="async"
      onError={advance}
    />
  );
}
