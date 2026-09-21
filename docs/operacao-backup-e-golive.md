# Operação: backup, recuperação e go-live

Documento operacional. Nada aqui é executado automaticamente.

## Backup e recuperação

Capacidades confirmadas neste projeto:

- Todas as mudanças de banco estão versionadas em `drizzle/migrations/` (0001 a 0013).
  Recriar o schema do zero é reaplicar as migrações na ordem.
- Rollback é **lógico**: nenhuma migração apaga tabela ou coluna. Para desfazer um
  comportamento, escreva uma nova migração que restaure a função anterior.
- Backup automático do banco (point-in-time) depende do plano contratado da
  infraestrutura. **Confirmar no painel do plano** antes de prometer RPO/RTO.
  Enquanto não confirmado, trate o backup como manual.

Backup manual recomendado (semanal, antes de cada mudança grande):

1. Exportar as tabelas de negócio (`orders`, `order_items`, `payments`,
   `payment_events`, `stock_movements`, `products`, `categories`, `coupons`).
2. Guardar o arquivo fora do provedor (armazenamento próprio ou nuvem pessoal).
3. Registrar data/hora e a última migração aplicada.

Checklist de recuperação:

1. Criar ambiente novo e aplicar todas as migrações em ordem.
2. Restaurar o export mais recente das tabelas de negócio.
3. Recadastrar os segredos (chaves de pagamento e credencial do aviso).
4. Recriar o administrador e conferir papéis em `user_roles`.
5. Rodar `npm test` e `npm run test:e2e`, depois um pedido de ponta a ponta em teste.

## Retenção de dados

- Código de entrega em texto: apagado automaticamente quando o pedido é entregue
  ou cancelado (gatilho `trg_purge_delivery_pin`).
- Auditoria antiga (`payment_events`, `order_assignment_events`, limites de abuso):
  existe a rotina `purge_old_audit_data(p_days)`, **desligada por padrão**.
  O prazo é decisão do negócio; para ligar, agende a chamada com o prazo escolhido.

## Go-live: o que depende de ação humana

1. Trocar a senha do administrador (mecanismo seguro de recuperação de senha; nunca no chat).
2. Cadastrar as credenciais de **teste** da Pagar.me nos segredos do projeto:
   `PAGARME_SECRET_KEY` (sk_test_), `PAGARME_WEBHOOK_BASIC` (usuário:senha do aviso)
   e, se necessário, `PAGARME_BASE_URL`.
3. Configurar o endereço de aviso no painel da Pagar.me:
   `https://<dominio>/api/public/webhooks/pagarme` com o mesmo usuário/senha.
   Sem esse segredo o endereço responde 503 e o PIX não gera cobrança.
4. Rodar um pedido PIX completo em ambiente de teste.
5. Só então trocar para as credenciais de produção e fazer um pedido real pequeno.
6. Domínio próprio com HTTPS.
7. Preencher os dados reais da loja (contatos, horários, zonas, taxas).
8. Publicar termos de uso e política de privacidade.
9. Confirmar a política de backup do plano contratado.
10. Teste de fumaça com contas de cliente, entregador e administrador.
