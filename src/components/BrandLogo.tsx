import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Logo oficial SAIDERA.
 *
 * O PNG oficial deve ser colocado em `public/branding/saidera-logo.png`
 * (arte horizontal/emblema: símbolo central + SAIDERA + ADEGA E DISTRIBUIDORA).
 * Enquanto o arquivo não existir no deploy, o componente exibe
 * automaticamente o wordmark temporário em sans — sem recriar símbolo,
 * texto ou estilo da arte oficial por CSS.
 *
 * Não aplicar filtros CSS (invert/brightness/contrast) sobre a imagem:
 * a arte oficial já é grafite + dourado e não deve ser alterada pelo tema.
 */

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
  const [assetMissing, setAssetMissing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Com SSR, o erro de carregamento pode acontecer antes da hidratação
  // anexar o onError — confere o estado real da imagem após montar.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setAssetMissing(true);
    }
  }, []);

  if (assetMissing) {
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
      src="/branding/saidera-logo.png"
      alt="SAIDERA — Adega e Distribuidora"
      className={cn("w-auto max-w-[240px] shrink-0 object-contain", SIZES[size], className)}
      decoding="async"
      onError={() => setAssetMissing(true)}
    />
  );
}
