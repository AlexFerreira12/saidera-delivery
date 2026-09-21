# Bloco E — Pagamentos PIX com Pagar.me (Core v5) + endurecimento do código de entrega

Plano atualizado para **Pagar.me (Stone), API Core v5**. Nada será implementado nem migrado antes da sua aprovação. Nenhuma credencial será pedida agora e nenhuma cobrança real será criada.

## 1. Situação atual (auditoria já feita)

- `create_order` recalcula tudo no servidor, cria o pedido (`status='novo'`, `payment_status='pendente'`), gera o código de entrega, baixa o estoque pelo ledger do Bloco C e grava uma linha em `payments` com `provider='na_entrega'`.
- PIX está bloqueado no servidor e desabilitado no checkout.
- `payments` tem provider, método, situação, valor, referência externa, QR e copia-e-cola; faltam moeda, expiração, marcos de tempo, chave de idempotência, unicidade por referência e registro de eventos.
- Cancelamento devolve estoque exatamente uma vez (gatilho + marcação de devolução).
- Checkout não tem proteção contra duplo toque: hoje dois toques criariam dois pedidos.
- Gravação em `payments` e em `orders` só é permitida ao administrador — o backend entrará por função de servidor, o que mantém esse desenho.

## 2. Como a Pagar.me será usada

- Base de integração: `https://api.pagar.me/core/v5`, autenticação HTTP Basic com a Secret Key como usuário e senha vazia; chave `sk_test_*` usa o simulador e `sk_*` vai para produção, no mesmo endereço [4](https://docs.pagar.me/reference/autentica%C3%A7%C3%A3o-2).
- PIX é criado dentro do pedido, com `payment_method: "pix"` e o objeto `pix` contendo `expires_in` (ou `expires_at`); o estorno de PIX é feito por cancelamento da cobrança informando o id dela [1](https://docs.pagar.me/reference/pix-2).
- Valores trafegam **em centavos**; o app converte a partir do total já calculado no banco.
- Eventos de webhook relevantes: `order.paid`, `charge.paid`, `charge.payment_failed`, `charge.refunded` e afins; a lista completa e os nomes exatos serão conferidos na documentação no momento de codificar [2](https://docs.pagar.me/reference/eventos-de-webhook-1).
- **Autenticidade do webhook**: a Core v5 não documenta assinatura HMAC; a proteção oficial é autenticação básica configurada no próprio webhook, mais reenvio automático e consulta/reenvio manual pela API [1](https://docs.pagar.me/docs/webhooks). Por isso o desenho abaixo **nunca confia no corpo recebido**: o webhook só dispara uma reconsulta da cobrança na API da Pagar.me, e é essa resposta que decide o status. Antes de codificar, confirmo na documentação vigente se passou a existir assinatura.

## 3. Segredos

- `PAGARME_SECRET_KEY`, `PAGARME_BASE_URL` e `PAGARME_WEBHOOK_BASIC` ficam apenas nos segredos do servidor, lidos dentro dos manipuladores. Nunca em variáveis do app, no banco, nas configurações da loja, no pacote enviado ao navegador ou em registros de log. A chave pública não é necessária neste bloco (sem cartão).
- Vou pedir as credenciais só na hora de integrar, e começamos por `sk_test_*`.

## 4. Banco (migração aditiva, nada é removido)

- `payments` ganha: `currency` (padrão BRL), `provider_order_id`, `provider_charge_id`, `idempotency_key`, `expires_at`, `paid_at`, `failed_at`, `canceled_at`, `refunded_at`, `refunded_amount`, `last_event_at`, `reconcile_flag` + `reconcile_reason`.
  - Único parcial em (`provider`, `provider_charge_id`) quando preenchido.
  - Único parcial: no máximo uma cobrança PIX viva por pedido.
- Nova `payment_events`: pagamento, pedido, tipo do evento, id do evento/cobrança na Pagar.me, situação apurada **após reconsulta**, resumo mínimo (id, valor, moeda, situação, data — sem dados pessoais), recebido em. Único por (provider, event_id) → reenvio não duplica. Leitura só admin.
- `orders` ganha `client_request_id`, único por cliente → duplo toque devolve o mesmo pedido.
- Situações de pagamento: `pendente` → `aguardando_pagamento` → `pago` | `expirado` | `falhou` | `cancelado` | `estornado`. Uma ordem de precedência impede retrocesso: evento antigo chegando depois de `pago` é registrado e ignorado.
- Novos códigos de situação do pedido: `aguardando_pagamento` (PIX não pago). Pedido nesse estado **não** aparece para preparo nem na fila do entregador.

## 5. Funções e rotas de servidor

- `create_order` passa a aceitar `pix` e `client_request_id`: com PIX o pedido nasce em `aguardando_pagamento`; com dinheiro/cartão na entrega nada muda. Se o mesmo `client_request_id` chegar de novo, devolve o pedido já criado em vez de criar outro.
- `criar cobrança PIX` (função de servidor autenticada): lê o total do banco, monta o pedido na Pagar.me com o valor em centavos e `expires_in` (30 minutos, ajustável), envia a chave de idempotência da Pagar.me derivada do pedido **e** guarda a nossa, grava ids, QR, copia-e-cola e validade, devolve à tela apenas o necessário. Chamar duas vezes reaproveita a cobrança viva.
- `sincronizar pagamento` (função de servidor): consulta a cobrança na Pagar.me e aplica o resultado pela mesma função de banco usada pelo webhook. Usada pelo admin e pelo próprio cliente ao reabrir o pedido.
- Webhook em `/api/public/webhooks/pagarme`: confere a autenticação básica configurada, grava o evento (único por id), **reconsulta a cobrança na API** e aplica o resultado; corpo divergente da consulta nunca prevalece. Responde 200 também em reenvio.
- `aplicar situação de pagamento` (função de banco, SECURITY DEFINER): trava o pedido, confere valor, moeda e id da cobrança, respeita a precedência de estados, atualiza `payments` e `orders` e registra o evento. É o único caminho de escrita.
- Expiração: varredura periódica cancela cobranças vencidas (e o mesmo é checado quando o cliente abre o pedido). O cancelamento usa o caminho já existente, então o estoque volta **exatamente uma vez** pela infraestrutura do Bloco C. Pagamento que chegar depois do cancelamento não reabre o pedido: marca para conciliação e avisa o admin.
- Todas as funções com `search_path` fixo e permissão de execução só para quem precisa; visitante não executa nenhuma delas.

## 6. Telas

- **Checkout**: PIX volta a aparecer. Após confirmar, tela com QR, botão de copiar o código, contagem regressiva, atualização em tempo real e estados pago / expirado / erro. Botão de gerar nova cobrança só depois de expirar. Botão de confirmar bloqueado durante o envio.
- **Meus pedidos / pedido**: situação do pagamento visível; pedido aguardando pagamento fica destacado com atalho para pagar.
- **Admin › Pagamentos** (nova aba): pedido, método, valor, situação, referência da Pagar.me, horário, filtros por período/situação/método, ação "consultar na Pagar.me e sincronizar" e solicitação de estorno (cancelamento da cobrança). Não haverá botão solto de "marcar como pago": só sincronização e, em último caso, lançamento manual restrito ao admin com motivo obrigatório e registro.

## 7. Pagamento na entrega e cartão

- Dinheiro e cartão na entrega seguem idênticos e nunca contam como pagos antes da entrega.
- Cartão online fica fora deste bloco. Se entrar depois, será por tokenização/checkout da Pagar.me, sem a chave secreta no navegador e sem guardar dados de cartão aqui.

## 8. Endurecimento do código de entrega (Bloco D), incluído aqui

- O texto puro do código passa a ser apagado assim que o pedido é entregue ou cancelado.
- O hash atual (previsível, baseado no id do pedido) é substituído por um mecanismo com segredo do servidor, gerado automaticamente e nunca exposto.
- O entregador continua sem enxergar o código em momento algum; a validação segue no servidor, com contagem de tentativas e bloqueio após cinco erros.
- Pedidos antigos continuam válidos: a migração regrava o novo hash a partir do texto ainda existente antes de limpar os finalizados.

## 9. Testes (tudo em ambiente de teste, sem cobrança real)

Criação da cobrança, pagamento confirmado pelo simulador, webhook repetido, webhook sem credencial, corpo adulterado divergindo da consulta, valor ou moeda divergente, evento fora de ordem, expiração com devolução única de estoque, duplo toque no checkout, reaproveitamento da cobrança viva, cancelamento de pedido já pago, permissões e tentativa de visitante chamar funções internas, fluxo do entregador intacto, código de entrega antes e depois da troca de hash, além de verificação de tipos, revisão de código e compilação. Dados de teste removidos ao final.

## 10. Riscos e recuo

- Pagar.me indisponível na criação da cobrança → pedido fica aguardando e o cliente pode tentar de novo ou escolher pagamento na entrega.
- Webhook atrasado → a contagem regressiva não cancela nada antes da janela de tolerância, e a sincronização manual resolve.
- Sem assinatura criptográfica no webhook, a reconsulta obrigatória na API é a defesa; mesmo que alguém descubra o endereço, não consegue marcar nada como pago.
- Recuo: tudo é aditivo; desligar o PIX volta a ser uma chave de configuração e nada do que existe hoje deixa de funcionar.

## 11. Fora deste bloco

Funcionamento offline e qualidade (Bloco F), cartão salvo, divisão de valores, marketplace e comissão de entregador.
