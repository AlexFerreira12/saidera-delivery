# Bloco C — Estoque confiável e auditável

Objetivo: todo movimento de estoque passa a ficar registrado, com responsável, motivo e saldo antes/depois, sem alterar o comportamento já validado de criação de pedido, cancelamento e as regras de segurança dos blocos anteriores.

## 1. Novo registro de movimentações (`stock_movements`)

Colunas:

- `id` (identificador), `product_id` (produto, obrigatório)
- `kind`: `saldo_inicial`, `entrada`, `venda`, `cancelamento`, `ajuste`, `perda`, `inventario`
- `quantity_delta` (inteiro com sinal, diferente de zero, exceto inventário sem diferença — nesse caso nada é gravado)
- `stock_before`, `stock_after` (inteiros, nunca negativos)
- `reason` (motivo/observação, texto opcional; obrigatório para ajuste, perda e inventário)
- `order_id` (quando vem de um pedido), `actor_user_id` (quem executou; vazio quando é o sistema)
- `unit_cost`, `cost_before`, `cost_after` (opcionais; preenchidos na entrada quando o custo é informado)
- `source` (`app`, `rpc`, `trigger`, `migration`) e `idempotency_key` (texto único)
- `created_at`

Índices: por produto + data (histórico), por data (relatórios), por pedido, e um índice único em `idempotency_key`.

Chave de idempotência por natureza do evento:
- venda: `venda:<pedido>:<produto>`
- cancelamento: `cancelamento:<pedido>:<produto>`
- saldo inicial: `saldo_inicial:<produto>`

Assim, mesmo que uma rotina rode duas vezes, o segundo registro é descartado e o estoque não é debitado/devolvido em duplicidade.

## 2. Integração com pedidos (sem mudar as regras já validadas)

- `create_order`: mantém exatamente a validação, o travamento por produto (`FOR UPDATE`) e o cálculo de preços atuais. Acrescenta apenas, dentro da mesma transação, a gravação de um movimento `venda` por item, com `ON CONFLICT DO NOTHING` na chave de idempotência.
- `apply_stock_movement` (gatilho de cancelamento): continua devolvendo o estoque uma única vez (já controlado por `stock_restored_at`) e passa a gravar um movimento `cancelamento` por item, também idempotente.
- Nenhuma mudança em preços, cupons, status ou permissões de pedido.

## 3. Operações administrativas por função segura

Novas funções, todas exigindo administrador (`is_admin()`), executando de forma transacional e com travamento por produto em ordem determinística (por identificador) para evitar travas cruzadas:

- `admin_stock_entry(produto, quantidade, motivo, custo unitário opcional)` — entrada/reposição; se o custo for informado, atualiza `products.cost` e registra custo anterior/novo.
- `admin_stock_adjust(produto, variação, tipo, motivo)` — ajuste ou perda/quebra; recusa deixar o estoque negativo.
- `admin_stock_inventory(produto, estoque físico contado, motivo)` — grava a diferença como `inventario`; sem diferença, não grava nada.
- `admin_stock_bulk_entry(lista de produtos e quantidades, motivo)` — reposição em lote numa única transação: ou entra tudo, ou nada.
- `admin_stock_history(produto opcional, tipo opcional, período, limite, deslocamento)` — histórico paginado com nome do produto e nome de quem executou.

Alteração direta do campo de estoque pelo painel deixa de ser usada: a tela de produtos passa a direcionar para a tela de estoque. A permissão de escrita em produtos continua exclusiva do administrador (cliente e visitante nunca escrevem).

## 4. Permissões

- Movimentações: leitura e escrita apenas para administrador; visitante e cliente sem qualquer acesso (sem permissão de leitura concedida).
- As funções acima só podem ser executadas por usuário autenticado, e cada uma verifica administrador internamente.
- Custo continua invisível para cliente/visitante (regra do Bloco A preservada).

## 5. Produtos já existentes

A migração não inventa histórico. Ela grava um único evento `saldo_inicial` por produto com o estoque atual (origem: migração, sem responsável), servindo de ponto de partida do histórico. Produtos com estoque zero também recebem o evento, para que todo produto tenha uma linha de partida.

## 6. Telas

- Nova rota `/admin/estoque`: lista com busca, estoque atual, mínimo, marcação de "baixo" e "zerado"; ações de entrada, ajuste, perda e inventário por produto; reposição em lote; histórico com filtro por tipo e período, com paginação.
- Nova aba "Estoque" no menu do painel.
- `/admin/produtos`: o campo de estoque passa a ser somente leitura, com atalho para a tela de estoque (sem redesign).
- Visão geral (Bloco B) continua igual, apontando estoque baixo e sem estoque.

Arquivos previstos: `src/lib/stock.ts` (tipos e chamadas), `src/routes/admin.estoque.tsx`, ajustes pequenos em `src/routes/admin.tsx` (menu) e `src/routes/admin.produtos.tsx`.

## 7. Testes planejados

Venda (baixa + movimento gravado), cancelamento (devolução única), cancelamento repetido (sem segunda devolução), entrada, perda, inventário com e sem diferença, lote com item inválido (nada entra), tentativa de estoque negativo, leitura do histórico por cliente (negada) e por administrador (permitida), tipos/padronização/build. Todo dado de teste criado é removido ao final.

## 8. Riscos e reversão

- Risco principal: mexer nas funções de pedido. Mitigação: as regras existentes não são reescritas — apenas acrescentamos a gravação do movimento no mesmo bloco transacional.
- Risco de travamento cruzado em lote: mitigado pela ordem fixa de travamento.
- Reversão lógica: as funções novas podem ser desativadas e o registro de movimentações ignorado sem afetar pedidos, já que o estoque continua no próprio produto — o registro é complementar, não substituto.

## 9. Fora desta etapa

Entrega completa (Bloco D), pagamento online (Bloco E), qualidade/PWA (Bloco F), relatórios financeiros e contabilidade de custo médio.
