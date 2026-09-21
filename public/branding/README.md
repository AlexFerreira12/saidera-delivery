# Marca SAIDERA — arquivo oficial do logo

Coloque aqui o PNG oficial do logo com o nome exato:

```
public/branding/saidera-logo.png
```

Requisitos do arquivo:

- Arte horizontal/emblema oficial (símbolo central + SAIDERA + ADEGA E DISTRIBUIDORA + BONS RÓTULOS, GRANDES MOMENTOS), conforme aprovado.
- PNG com fundo transparente (a arte já é grafite + dourado; a interface NÃO aplica filtros CSS sobre ela).
- Largura recomendada: pelo menos 720 px (será exibido com ~46–60 px de altura no cabeçalho mobile, com `object-contain` — sem esticar nem cortar).
- Se a arte tiver elementos pretos/grafite que sumam sobre o cabeçalho escuro, gere também uma variante para fundo escuro (ex.: `saidera-logo-on-dark.png`) e avise para ligarmos a prop `variant` do componente `BrandLogo`.

Enquanto o arquivo não existir, o componente `src/components/BrandLogo.tsx`
exibe automaticamente o wordmark temporário em sans. Não recriar o logo por
CSS, texto, emoji ou símbolo diferente.
