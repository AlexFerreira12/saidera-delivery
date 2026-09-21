# Correção P0: pedidos confiáveis no servidor

Hoje o app cria o pedido direto do navegador: subtotal, desconto, taxa de entrega e total são calculados no celular do cliente e gravados como vieram. Quem souber mexer pode comprar por R$ 0,01, usar cupom vencido ou comprar item sem estoque. Esta etapa move toda a decisão de preço, estoque e cupom para o banco, sem mudar o visual nem remover funcionalidades.

## O que muda para o cliente

- Ao confirmar o pedido, o servidor recalcula tudo e responde com o valor real. Mensagens claras quando: loja fechada, item sem estoque, bairro fora da área, pedido abaixo do mínimo, cupom inválido/expirado/já usado.
- No carrinho, o total com cupom passa a aparecer como **estimativa** — a validação definitiva acontece ao confirmar.
- **PIX online fica indisponível** (integração de pagamento pendente) e não pode ser selecionado, para não dar falsa confirmação de pagamento. Dinheiro e cartão na entrega continuam funcionando normalmente.

## Banco de dados (migrations)

**1. Função `create_order` (SECURITY DEFINER)**
Recebe apenas `address_id`, `payment_method`, `notes`, `change_for`, `coupon_code` e itens `[{product_id, quantity}]`. O usuário vem de `auth.uid()`. Em uma única transação:

- exige usuário autenticado e endereço pertencente a ele;
- exige `store_settings.is_open = true`;
- bloqueia `payment_method = 'pix'` (sem gateway) e aceita só `dinheiro` / `cartao_entrega`;
- trava cada produto com `SELECT ... FOR UPDATE`, confere `is_active`, `quantity > 0` e estoque suficiente (evita venda a mais em pedidos simultâneos);
- recalcula preço unitário a partir do banco: `promo_price` quando existir, e melhor faixa de `promotions` ativa (`min_quantity <= quantity`), nunca abaixo do preço base;
- resolve a zona pelo bairro do endereço (`delivery_zones`), aplica `fee`, `min_order` e frete grátis por `store_settings.free_delivery_above`;
- valida o cupom no servidor: ativo, janela de datas, `max_uses` global, `max_uses_per_user` via `coupon_usages`, `first_order_only`, `min_order` e tipo (`percent`, valor fixo, `free_shipping`);
- calcula subtotal, desconto, taxa e total; grava `orders`, `order_items`, `coupon_usages`, incrementa `coupons.used_count` e baixa o estoque. Qualquer falha desfaz tudo (`RAISE EXCEPTION`).

Retorna `order_id`, `order_number`, subtotal, desconto, taxa e total. `EXECUTE` só para `authenticated`.

**2. Cancelamento com devolução de estoque idempotente**
Nova coluna `orders.stock_restored_at` (nullable). O gatilho de estoque passa a `BEFORE UPDATE` e só devolve quando o pedido entra em `cancelado` e `stock_restored_at IS NULL`, marcando a data — cancelar duas vezes não duplica estoque. Nova função `set_order_status(order_id, status)` para admin/entregador, com verificação de papel e transições válidas.

**3. RLS e grants revisados**

| Tabela | Antes | Depois |
| --- | --- | --- |
| `orders` | cliente insere e atualiza | insert só pela RPC; update só admin/entregador; cliente lê os próprios |
| `order_items` | cliente insere | insert removido do cliente (só RPC) |
| `payments` | cliente insere | insert/update só admin |
| `coupon_usages` | cliente insere | insert só pela RPC |
| `products`, `categories`, `promotions`, `store_settings`, `delivery_zones`, `coupons`, `banners` | grant amplo a `authenticated` | grants de escrita removidos do papel comum (política admin mantida) |
| `user_roles` | leitura própria | inalterado; sem escrita pelo cliente |

Entregador mantém o acesso atual a entregas atribuídas/disponíveis. Admin mantém tudo.

## Arquivos do app

- `src/routes/checkout.tsx` — envia só `product_id` + `quantity` à RPC, mostra o total autoritativo retornado, traduz os erros do servidor em mensagens em português; PIX desabilitado com aviso "integração pendente".
- `src/routes/carrinho.tsx` — cupom rotulado como estimativa.
- `src/lib/orders.ts` / novo `src/lib/checkout.ts` — mapeamento dos códigos de erro da RPC para mensagens.
- `src/routes/admin.index.tsx` — cancelamento e mudança de status via `set_order_status`.
- `src/routes/__root.tsx` — remove `manifest` e `apple-touch-icon` duplicados e o caminho inválido `/icon-192.png`.
- `src/integrations/supabase/types.ts` — regenerado após as migrations.

Depois: checagem de tipos e lint, e correção do que aparecer.

## Limitações que permanecem

- Sem gateway de pagamento real: PIX online segue desativado e pedidos em dinheiro/cartão são confirmados na entrega.
- Estoque é reservado no momento do pedido; não há expiração automática de pedidos não pagos.
- Nenhuma mudança de identidade visual ou layout.
