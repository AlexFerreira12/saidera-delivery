# Bloco D — Entrega completa (plano, sem implementação)

## 1. Auditoria do que existe hoje

**Banco**
- `orders`: `driver_id` (FK `delivery_drivers`), `status` texto livre validado só nas RPCs, `eta_minutes`, `address_snapshot`, `customer_name`, `customer_phone`, `notes`. UPDATE direto: só admin (`orders_update_admin`).
- `orders` SELECT hoje: dono, admin, `is_order_driver(id)` **ou** qualquer usuário com papel `driver` quando `driver_id IS NULL AND status IN ('pronto','saiu_para_entrega')`.
- `order_items`, `order_status_events`, `deliveries`: SELECT por `can_view_order(order_id)` — e `can_view_order` libera para **qualquer** `driver`, não só o do pedido.
- `deliveries`: policy `deliveries_write` = `ALL` para qualquer `driver` ou admin. Tabela **não é usada por nenhuma tela**.
- `addresses`: só dono/admin (driver não lê — hoje usa `address_snapshot`). `profiles`: só dono/admin.
- `accept_delivery(p_order_id)`: SECURITY DEFINER, exige driver ativo, `FOR UPDATE` no pedido, recusa se já tem outro driver, exige status `pronto`/`saiu_para_entrega`, grava `driver_id` e status `saiu_para_entrega`.
- `set_order_status`: admin livre; driver só pedido próprio e só `pronto→saiu_para_entrega` e `saiu_para_entrega→entregue`; bloqueia pedido finalizado. `order_status_events` gravado por trigger.

**Frontend**
- `/entregador`: lista `orders` com `select("*")` filtrando status, separa "minhas"/"disponíveis" no cliente, polling 15 s, botões Aceitar/Concluir, link Google Maps, botão Ligar. Sem itens do pedido, sem histórico, sem proteção de duplo clique, sem realtime.
- `/admin/pedidos`: lista com realtime, avança status, cancela. Não mostra entregador nem permite reatribuir.
- `/pedido/$id` (cliente): realtime em `orders`, linha do tempo. Sem informação do entregador.

**Falhas encontradas (a corrigir no Bloco D)**
1. `can_view_order` libera itens/eventos/entregas de **qualquer** pedido a qualquer driver.
2. Fila expõe o pedido inteiro (telefone, endereço, total, observações) antes do aceite.
3. `deliveries` com escrita total para driver e sem uso — superfície aberta.
4. Fila inclui `saiu_para_entrega` sem driver (estado que não deveria existir).
5. Sem comprovação de entrega: driver marca "entregue" sozinho.
6. Sem reatribuição administrativa nem histórico do entregador.

## 2. Máquina de estados (mantida, formalizada)

`novo → confirmado → em_preparo → pronto → saiu_para_entrega → entregue`; `cancelado` a partir de qualquer não-final. Só admin cancela. Driver: apenas `pronto→saiu_para_entrega` (implícito no aceite) e `saiu_para_entrega→entregue` (exige PIN). Admin pode voltar/pular como hoje. Todo evento continua auditado por trigger em `order_status_events`.

## 3. Comprovação de entrega — PIN (escolha recomendada)

PIN de 4 dígitos gerado no `create_order`, guardado **apenas como hash** (`delivery_pin_hash` via `crypt`/`pgcrypto`) mais `delivery_pin` em coluna visível só ao dono e admin. Vantagem sobre foto/assinatura: zero upload, zero storage, zero LGPD extra, funciona em rede ruim, prova que o entregador esteve com o cliente. Foto/assinatura fica fora deste bloco.

Fluxo: cliente vê o PIN em `/pedido/$id` quando o status é `saiu_para_entrega`; entregador digita; `driver_complete_delivery(p_order_id, p_pin)` compara o hash server-side, marca `entregue`, grava `delivered_at` e `delivery_confirmed_by='pin'`. PIN nunca sai do servidor para o driver, nunca entra em log nem em listagem.

Exceção sem PIN: `admin_force_deliver(p_order_id, p_reason)` — só admin, motivo obrigatório, grava `delivery_confirmed_by='admin'` e `delivery_override_reason`. Driver não tem caminho de bypass.

## 4. Schema planejado (migração `block_d_delivery_flow`, aditiva)

`orders` (todas nuláveis/defaults, nada destrutivo):
- `delivery_pin text`, `delivery_pin_hash text`, `accepted_at timestamptz`, `dispatched_at timestamptz`, `delivered_at timestamptz`, `delivery_confirmed_by text CHECK IN ('pin','admin')`, `delivery_override_reason text`, `pin_attempts int NOT NULL DEFAULT 0`.
- Índices: `(status, created_at) WHERE driver_id IS NULL`, `(driver_id, created_at DESC)`.
- Backfill: pedidos já `entregue` recebem `delivered_at = updated_at` e `delivery_confirmed_by='admin'` (sem inventar PIN).

Nova tabela `order_assignment_events` (auditoria de atribuição): `id`, `order_id`, `driver_id`, `action CHECK IN ('accept','reassign','unassign','force_deliver')`, `actor_user_id`, `reason`, `created_at`. GRANT: `SELECT` a `authenticated` (RLS: admin ou driver da linha), escrita só por funções SECURITY DEFINER; `GRANT ALL ... TO service_role`.

`deliveries`: policy `deliveries_write` revogada (passa a admin apenas). Tabela fica como está, sem uso, até decidirmos removê-la em bloco futuro.

## 5. RPCs

- `driver_available_orders()` — retorna **apenas** `order_number`, bairro, rua sem número, qtd. de itens, total, forma de pagamento, `created_at`, `eta_minutes`. Sem nome, telefone, número, complemento ou observação antes do aceite. Ordenação: `pronto` mais antigo primeiro.
- `driver_my_orders()` — pedido atribuído com dados completos operacionais: cliente, telefone, endereço completo com complemento/referência, itens e quantidades, observações, forma de pagamento e troco. Sem custo, sem margem, sem dados de outros pedidos.
- `driver_history(p_limit, p_offset)` — entregas concluídas do próprio driver + contadores (hoje, 7 dias, total).
- `accept_delivery` (alterado) — passa a exigir `status='pronto' AND driver_id IS NULL`, grava `accepted_at`/`dispatched_at`, registra `order_assignment_events('accept')`; segunda chamada do mesmo driver é idempotente (retorna o mesmo resultado), de outro driver retorna `ENTREGA_JA_ACEITA`.
- `driver_complete_delivery(p_order_id, p_pin)` — driver dono, status `saiu_para_entrega`, valida hash; PIN errado incrementa `pin_attempts` e retorna `PIN_INVALIDO` (bloqueio após 5 tentativas → `PIN_BLOQUEADO`, liberado só pelo admin); repetição após entregue retorna sucesso idempotente.
- `admin_assign_driver(p_order_id, p_driver_id)` / `admin_unassign_driver(p_order_id, p_reason)` — só admin, recusam pedido `entregue`/`cancelado`, gravam auditoria; `unassign` volta o status para `pronto`.
- `admin_force_deliver(p_order_id, p_reason)` — descrito acima.
- `set_order_status`: driver perde a transição para `entregue` (passa a ser exclusiva de `driver_complete_delivery`); resto inalterado.

Todas SECURITY DEFINER, `SET search_path = public`, `is_admin()`/checagem de driver interna, `REVOKE ALL FROM PUBLIC, anon` e `GRANT EXECUTE TO authenticated`.

## 6. RLS / privacidade

- `can_view_order` reescrita: dono, admin ou **driver atribuído** (`is_order_driver`). Fim do acesso genérico de driver a itens/eventos.
- `orders_select`: remove o ramo da fila aberta; driver enxerga a fila só pela RPC, e o pedido completo só quando atribuído.
- `addresses`/`profiles` permanecem fechados ao driver — os dados chegam pelas RPCs.
- PIN: `delivery_pin` só é devolvido ao dono do pedido (RPC/coluna filtrada) e ao admin; nunca nas RPCs de driver.

## 7. Frontend

- `src/lib/delivery.ts` (novo): tipos e chamadas das RPCs, labels e `deliveryErrorMessage` (PIN_INVALIDO, PIN_BLOQUEADO, ENTREGA_JA_ACEITA, ENTREGADOR_NAO_CADASTRADO, PEDIDO_NAO_DISPONIVEL, SEM_PERMISSAO, MOTIVO_OBRIGATORIO).
- `src/routes/entregador.tsx`: abas Disponíveis / Minha entrega / Histórico; realtime em `orders` + polling de reserva; cards de fila com dados mínimos; card atribuído com itens, contato, endereço completo, botão Rota (Google Maps por endereço, fallback `geo:` e cópia do endereço) e teclado numérico do PIN; botões com estado de envio para impedir duplo clique; mensagens de erro/retry claras. Sem redesign — mesmos componentes visuais atuais.
- `src/routes/admin.pedidos.tsx`: coluna/etiqueta do entregador, ação Reatribuir/Remover atribuição e "Marcar entregue sem PIN" com motivo e confirmação.
- `src/routes/pedido.$id.tsx`: bloco com o entregador e o PIN destacado quando `saiu_para_entrega`, e "Entregue às HH:MM" no fim; realtime já existente cobre aceite/saída/entrega.
- Guardas de rota `/entregador` e `/admin`: aguardar sessão+papéis antes de renderizar (já feito no Bloco A, apenas conferir).

## 8. Concorrência e idempotência

Aceite: `SELECT ... FOR UPDATE` + condição `driver_id IS NULL` na mesma transação → só um vencedor; o perdedor recebe `ENTREGA_JA_ACEITA`. Conclusão repetida: retorna o estado atual sem novo evento. Reatribuição: bloqueada em pedido final. Estoque (Bloco C) não é tocado — entrega não mexe no ledger.

## 9. Testes planejados

Dois drivers aceitando o mesmo pedido em paralelo; driver inativo; driver tentando ler pedido alheio (itens/eventos/RPC); transição inválida; PIN correto, incorreto, repetido e bloqueio por tentativas; força-entrega do admin com e sem motivo; reatribuir e remover atribuição, inclusive em pedido entregue; histórico do driver; realtime no cliente; `pg_policies`/`pg_proc`/grants; typecheck, lint e build. Todos os pedidos, endereços e vínculos de teste removidos ao final.

## 10. Riscos e rollback lógico

- Mexer em `can_view_order` afeta itens/eventos/entregas: mitigado testando cliente, admin e driver antes de fechar.
- Tirar `entregue` do `set_order_status` do driver pode travar a operação se o PIN falhar: mitigado pela exceção administrativa auditada.
- Rollback: as colunas novas são aditivas e podem ficar inertes; basta reverter `can_view_order`/`orders_select` e voltar a transição `entregue` ao `set_order_status` para retornar ao comportamento atual, sem perda de dados.

Fora deste bloco: pagamento online (E), PWA/offline e testes automatizados (F), upload de foto, rastreio por GPS e comissão do entregador.
