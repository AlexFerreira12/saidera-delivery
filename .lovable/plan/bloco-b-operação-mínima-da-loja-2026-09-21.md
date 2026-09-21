# Bloco B — Operação mínima da loja

Transformar /admin numa central operacional completa, sem redesign e sem tocar no fluxo de pedido/estoque já protegido.

## Novas telas (menu admin reorganizado, rolagem horizontal mobile)

Visão geral · Pedidos · Produtos · Categorias · Promoções · Cupons · Banners · Entrega · Clientes · Entregadores · Configurações

1. **Visão geral** (reescrita da tela atual): pedidos de hoje, faturamento do dia (pedidos não cancelados) e entregues, contadores por etapa (novo/em preparo/pronto/em rota), produtos com estoque baixo (estoque ≤ mínimo), status da loja (aberta/fechada) e atalhos para as áreas. Contagens feitas por consulta agregada no período, não sobre os últimos 100 pedidos.
2. **Categorias**: nome, endereço curto (slug gerado do nome e editável), ícone, ordem, ativo. Exclusão bloqueada quando houver produtos ligados — mensagem clara sugerindo desativar.
3. **Promoções**: produto, quantidade mínima, preço unitário, rótulo, início/fim, ativo. Valida quantidade > 0, preço > 0, datas coerentes e produto obrigatório.
4. **Cupons**: código, tipo (percentual / valor fixo / frete grátis), valor, pedido mínimo, período, limite total, limite por pessoa, só primeira compra, ativo, com contador de usos. Leitura segue restrita ao administrador.
5. **Banners**: título, subtítulo, imagem (URL), link/atalho, ordem, ativo.
6. **Entrega**: bairros com taxa, pedido mínimo, tempo estimado e ativo; bairro normalizado (sem espaços extras, sem repetir maiúsculas/minúsculas) para evitar duplicidade.
7. **Configurações**: abrir/fechar a loja com confirmação, nome, telefone, WhatsApp, endereço, horários, pedido mínimo, frete grátis acima de, taxa padrão, tempo médio. Nada de chaves ou dados internos.
8. **Clientes** (somente leitura): nome, telefone, e-mail, data de cadastro, nº de pedidos e total gasto; busca por nome/telefone.
9. **Entregadores**: lista com status e entregas em andamento/concluídas, ativar/desativar, e vínculo de um usuário já cadastrado (informando o e-mail dele) como entregador — o administrador nunca cria senha.

## Banco (uma migração)

- `admin_customers(p_search text)` — SECURITY DEFINER com verificação `is_admin()`; devolve perfis com nº de pedidos e total gasto.
- `admin_link_driver(p_email, p_name, p_phone, p_vehicle)` — SECURITY DEFINER com `is_admin()`; encontra o usuário pelo e-mail já cadastrado, concede o papel de entregador e cria/atualiza o cadastro. Erros claros: usuário não encontrado, já vinculado.
- `admin_driver_stats()` — SECURITY DEFINER com `is_admin()`; entregas em rota e concluídas por entregador.
- `admin_dashboard_metrics()` — SECURITY DEFINER com `is_admin()`; números do dia e contadores por etapa numa chamada.
- Permissão de execução dessas funções apenas para usuários autenticados; a checagem de administrador é feita dentro de cada função.
- Nenhuma alteração nas regras de acesso existentes: gravação já é restrita ao administrador em categorias, promoções, cupons, banners, zonas e configurações.

## Arquivos

- Novas rotas: `src/routes/admin.categorias.tsx`, `admin.promocoes.tsx`, `admin.cupons.tsx`, `admin.banners.tsx`, `admin.entrega.tsx`, `admin.configuracoes.tsx`, `admin.clientes.tsx`, `admin.entregadores.tsx`.
- Alterados: `src/routes/admin.tsx` (menu), `src/routes/admin.index.tsx` (visão geral), `src/lib/admin.ts` (novo: consultas e mutações administrativas).
- Componentes utilitários simples reaproveitando os estilos atuais (cartão, campo, botão) — sem mudança de identidade visual.

## Verificação

Tipos, lint e build; leitura e uma operação segura em cada área com dado de teste removido ao final; conferência das regras de acesso para garantir que nada foi aberto a cliente ou visitante.

## Fora do escopo

Histórico/ajuste de estoque com motivo (Bloco C), envio de imagens, pagamento online, histórico do entregador na área dele.
