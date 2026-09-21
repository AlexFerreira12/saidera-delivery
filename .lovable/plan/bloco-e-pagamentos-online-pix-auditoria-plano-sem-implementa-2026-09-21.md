# Bloco E — Pagamentos online (PIX). Auditoria + plano, sem implementação

## 1. O que existe hoje (auditoria)

**Pedido e pagamento**
- `create_order` recalcula tudo no servidor, cria o pedido com `status='novo'` e `payment_status='pendente'`, gera o código de entrega, dá baixa no estoque item a item (ledger do Bloco C, chave `venda:<item>`) e grava **uma** linha em `payments` com `provider='na_entrega'`, `method` = forma escolhida, `status='pendente'`, `amount` = total do servidor.
- PIX está bloqueado no servidor (`PIX_INDISPONIVEL`) e desativado no checkout.
- `payments` já tem `provider`, `method`, `status`, `amount`, `external_id`, `pix_qr_code`, `pix_copy_paste`, `created_at`. Falta: moeda, expiração, timestamps de pago/falhou, chave de idempotência, unicidade por referência do provedor, tabela de eventos do provedor.
- `orders.payment_status` existe e hoje nunca muda; `orders.status` segue o fluxo novo → confirmado → em_preparo → pronto → saiu_para_entrega → entregue.
- Cancelamento devolve estoque exatamente uma vez via gatilho + `stock_restored_at`.
- Não existe idempotência no checkout: dois toques criam dois pedidos e duas baixas de estoque.

**Permissões**
- `payments`: leitura por quem pode ver o pedido; gravação só admin. Cliente não insere nada. Correto para receber escrita só do backend.
- Nenhum segredo de pagamento no projeto; nada em `store_settings`.

**Código de entrega do Bloco D (revisão pedida)**
- O código fica em duas formas: `orders.delivery_pin_hash` (SHA-256 de `order_id:pin`) e o texto puro em `order_delivery_pins`, legível só pelo dono do pedido e pelo admin.
- Risco real: é um número de 4 dígitos com sal previsível (o próprio id do pedido) e o texto puro persiste para sempre, inclusive depois da entrega. Quem obtivesse uma cópia do banco recuperaria qualquer código por força bruta em segundos — mas o código sozinho não entrega nada: quem confirma precisa ser o entregador atribuído àquele pedido.
- Correção proposta (pequena, entra junto no Bloco E): apagar o texto puro assim que o pedido é entregue ou cancelado, e trocar o hash por HMAC com segredo de servidor. Sem isso, nada muda no fluxo; é endurecimento, não correção de falha explorável.

## 2. Provedor — comparação, escolha do usuário

Não vou escolher. Três caminhos tecnicamente compatíveis com a arquitetura atual (cobrança criada no servidor + webhook assinado):

| | Mercado Pago | PagBank (PagSeguro) | Provedor bancário direto (ex.: Efí/Gerencianet, Inter) |
|---|---|---|---|
| Conta | Conta MP, credenciais de produção e de teste | Conta PagBank vendedor, token e chave pública | Conta PJ no banco + certificado digital |
| PIX | Cobrança com QR e copia-e-cola por API | Igual | Igual, direto no arranjo do banco |
| Webhook | Notificação assinada com segredo configurável | Notificação com assinatura do vendedor | Webhook com certificado mútuo (mais trabalhoso) |
| Ambiente de teste | Sim, contas de teste completas | Sim, sandbox | Varia; costuma exigir homologação |
| Encaixe aqui | Muito bom: assinatura simples de conferir, documentação forte | Muito bom, marca conhecida no varejo | Melhor taxa, porém setup e certificado bem mais pesados |
| Custo | Confirmar no provedor | Confirmar no provedor | Confirmar no provedor |

Recomendação: começar por **Mercado Pago ou PagBank** — ambos resolvem com chave de API e webhook assinado, sem certificado. Taxas e prazo de repasse precisam ser confirmados direto no provedor; não consigo validar preço atual daqui. **Preciso da sua escolha antes de escrever qualquer código de integração.** O restante do plano serve para os dois, mudando apenas o adaptador do provedor.

## 3. Modelo de dados

Migração aditiva, sem apagar nada:

- `payments` ganha: `currency` (default `BRL`), `provider_payment_id`, `idempotency_key`, `expires_at`, `paid_at`, `failed_at`, `canceled_at`, `refunded_at`, `refunded_amount`, `last_event_at`.
  - Índice único parcial em (`provider`, `provider_payment_id`) quando não nulo.
  - Índice único parcial: no máximo uma cobrança online viva por pedido (status em pendente/aguardando).
- Nova `payment_events`: id, payment_id, order_id, provider, event_id do provedor, tipo, status resultante, payload **reduzido** (sem dados pessoais além do necessário: id da cobrança, valor, moeda, status, data), recebido_em. Único em (provider, event_id) → reenvio não duplica. Leitura só admin.
- `orders` ganha `client_request_id` com único por (user_id, client_request_id) → duplo clique não cria dois pedidos.
- Estados de pagamento: `pendente` → `aguardando_pagamento` → `pago` | `expirado` | `falhou` | `cancelado` | `estornado`. Transições só avançam; evento fora de ordem que tentar rebaixar um `pago` é registrado em `payment_events` e ignorado.
- Nada de cartão armazenado. Se um dia entrar cartão, será pelo checkout hospedado do provedor.

## 4. Fluxo PIX

1. Checkout chama `create_order` com `payment_method='pix'` e um `client_request_id` gerado no aparelho. O pedido nasce `status='aguardando_pagamento'`, `payment_status='aguardando_pagamento'`.
2. O cliente chama uma função de servidor `create_pix_charge(order_id)`, que lê o **total do banco** (nunca do navegador), pede a cobrança ao provedor com o segredo do servidor, guarda `provider_payment_id`, QR, copia-e-cola e validade, e devolve só o que a tela precisa.
3. A tela mostra QR, copia-e-cola e contagem regressiva (30 minutos, ajustável), acompanhando o status em tempo real. O retorno do navegador **nunca** marca pago.
4. O provedor chama o webhook; o servidor confere assinatura, valor, moeda e referência, marca `pago`, move o pedido para `confirmado` e libera o preparo.
5. Se o cliente reabrir o pedido, a mesma cobrança é reaproveitada enquanto estiver válida — não gera segunda cobrança.

## 5. Webhook

Rota pública `/api/public/webhooks/pagamentos` (server-side, TanStack), nunca no navegador:
- Confere a assinatura do provedor antes de ler qualquer coisa; assinatura inválida → 401 e nada gravado.
- Grava o evento primeiro (único por id de evento); se já existia, responde OK sem reprocessar.
- Confere que valor e moeda batem com o pedido e que `provider_payment_id` é o da cobrança daquele pedido; divergência → registra, marca para conciliação e **não** confirma.
- Toda a mudança de estado roda numa função no banco, travando o pedido, para que reenvio simultâneo não duplique nada.
- Chaves só em segredos do servidor; nunca em variáveis do app, no banco, no pacote enviado ao navegador ou em logs.

## 6. Estoque e expiração

Hoje o estoque baixa na criação do pedido, o que é bom contra venda dupla, mas exige devolução confiável quando o PIX não é pago.

- PIX expirado, falhado ou cancelado → o pedido vai para `cancelado` pelo caminho já existente, e o gatilho do Bloco C devolve o estoque **exatamente uma vez** graças a `stock_restored_at` e às chaves do ledger. Não crio caminho novo de devolução, nem conflito com o cancelamento manual do admin.
- Um processo agendado (a cada poucos minutos) varre cobranças vencidas e faz isso; a mesma regra roda também ao abrir o pedido, para não depender só do agendador.
- Se o pagamento chegar depois do cancelamento por expiração: o webhook não reabre o pedido; registra, marca para conciliação e avisa o admin — o dinheiro é devolvido pelo fluxo de estorno.

## 7. Pedido x pagamento

- Dinheiro e cartão na entrega: continuam exatamente como hoje, pedido entra em `novo` e segue o fluxo. Nunca são tratados como pagos antes da entrega.
- PIX: o pedido fica em `aguardando_pagamento` e **não aparece** para preparo nem na fila do entregador enquanto não estiver pago. O código de entrega, o PIN, as regras do entregador e o RLS do Bloco D ficam intactos.

## 8. Estorno / cancelamento de pedido já pago

- Estorno automático depende do provedor; no Bloco E fica um fluxo de admin auditado: o admin marca "solicitar estorno" com motivo, o servidor tenta o estorno pela API quando o provedor suportar, e registra tudo. Se não suportar, o estorno é feito pelo painel do provedor e o admin registra a confirmação — fica **explicitamente manual**.
- Não existirá botão "marcar como pago" solto: só "consultar no provedor e sincronizar", e um lançamento manual restrito ao admin, sempre com motivo e registro.

## 9. Telas

- **Checkout**: PIX volta a ficar selecionável; após confirmar, tela de pagamento com QR, botão de copiar, contagem regressiva, estados pago/expirado/erro, e botão de gerar nova cobrança quando expirar (sem duplicar a anterior).
- **Meu pedido / meus pedidos**: situação do pagamento visível; pedido aguardando pagamento aparece diferenciado.
- **Admin › Pagamentos** (nova aba): pedido, método, valor, situação, referência do provedor, horário, filtros por período/situação/método, ação de consultar no provedor e conciliar, mais a solicitação de estorno.

## 10. Riscos e recuo

- Provedor fora do ar na criação da cobrança → pedido fica aguardando, cliente pode tentar de novo ou trocar para pagamento na entrega.
- Webhook atrasado → contagem regressiva não cancela nada sozinha antes da janela de tolerância.
- Recuo: como tudo é aditivo, desligar o PIX volta a ser uma chave de configuração; nada do que existe hoje deixa de funcionar.

## 11. Testes antes de liberar

Tudo em ambiente de teste do provedor, sem cobrança real: cobrança criada, pagamento confirmado, webhook repetido, assinatura inválida, valor divergente, evento fora de ordem, expiração com devolução única de estoque, duplo clique no checkout, permissões e tentativa de visitante chamar as funções internas, além de verificação de tipos, revisão de código e compilação. Dados de teste removidos no fim.

## 12. Fora deste bloco

Funcionamento offline e qualidade (Bloco F), cartão salvo, divisão de valores, marketplace e comissão de entregador.

---

**Preciso de duas decisões antes de implementar:** o provedor (Mercado Pago, PagBank ou outro) e se você quer o endurecimento do código de entrega junto neste bloco.
