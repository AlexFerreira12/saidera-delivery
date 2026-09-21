import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Exibição padronizada de imagem de produto.
 *
 * Regras fixas (não alterar sem revisar todos os usos):
 * - object-contain + object-center: nunca corta, estica ou deforma;
 *   garrafas altas, latas e embalagens largas mantêm a proporção original.
 * - O espaço é reservado pelo container (altura/largura via className),
 *   então não há layout shift enquanto a imagem carrega.
 * - Fundo neutro (bg-card) e padding interno para respiro visual.
 * - Fallback discreto (marca/nome) para imagem ausente ou erro de carga.
 *
 * Aceita qualquer objeto com nome/imagem (Product, AdminProduct, CartItem).
 */
export type ProductImageSubject = {
  name: string;
  image_url?: string | null;
  brand?: string | null;
};

export function ProductImage({
  product,
  className = "",
  imgClassName = "",
}: {
  product: ProductImageSubject;
  /** Dimensões do container (ex.: "h-40 w-full"). O espaço é sempre reservado. */
  className?: string;
  /** Ajustes da imagem interna (ex.: padding menor em miniaturas). */
  imgClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = product.image_url ?? null;

  if (!src || failed) {
    return (
      <div className={cn("grid place-items-center overflow-hidden bg-secondary", className)}>
        <span className="line-clamp-2 px-2 text-center text-xs font-bold text-muted-foreground">
          {product.brand ?? product.name.split(" ")[0]}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden bg-card", className)}>
      <img
        src={src}
        alt={product.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("h-full w-full object-contain object-center p-2", imgClassName)}
      />
    </div>
  );
}
