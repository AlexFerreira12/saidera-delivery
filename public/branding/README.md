# Marca SAIDERA — arquivo oficial do logo

## Fonte primária: Supabase Storage (recomendado)

Envie o PNG oficial para o bucket **`catalogo`**, no caminho exato:

```
catalogo/branding/saidera-logo.png
```

- O bucket é **privado**; a leitura pública acontece somente via rota
  `/api/public/imagem/branding/saidera-logo.png` (lista branca de pastas no
  servidor). Upload/escrita continuam restritos a administradores.
- A pasta `branding` é criada automaticamente no primeiro upload — não é
  preciso criá-la manualmente.
- Cache público de até 5 minutos para esse caminho: ao substituir o arquivo,
  o novo logo aparece sem alteração de código.
- Enquanto o objeto não existir, o componente `src/components/BrandLogo.tsx`
  tenta o arquivo local abaixo e, por fim, exibe o wordmark temporário em sans.

## Fallback local (opcional)

Se preferir versionar o arquivo no deploy, coloque o PNG em:

```
public/branding/saidera-logo.png
```

## Requisitos do arquivo

- Arte horizontal/emblema oficial (símbolo central + SAIDERA + ADEGA E
  DISTRIBUIDORA + BONS RÓTULOS, GRANDES MOMENTOS), conforme aprovado.
- PNG com fundo transparente (a arte já é grafite + dourado; a interface NÃO
  aplica filtros CSS sobre ela).
- Largura recomendada: pelo menos 720 px (exibido com ~46–60 px de altura no
  cabeçalho mobile, com `object-contain` — sem esticar nem cortar).
- Se a arte tiver elementos pretos/grafite que sumam sobre o cabeçalho escuro,
  gere também uma variante para fundo escuro (ex.: `saidera-logo-on-dark.png`)
  e avise para ligarmos a prop `variant` do componente `BrandLogo`.

Não recriar o logo por CSS, texto, emoji ou símbolo diferente.
