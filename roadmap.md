# Roadmap

## Bloco F — Qualidade, PWA e produção (em execução)

- [x] F1 Segurança final (HIBP + senha atual, limite de abuso no webhook, cabeçalhos; view products_admin mantida como SECURITY DEFINER por causa das permissões de coluna)
- [x] F2 Imagens no armazenamento próprio (bucket privado "catalogo" + upload admin + rota pública de leitura)
- [x] F3 Rede ruim (timeout + retry nas chamadas ao provedor, bloqueio de duplo envio no upload)
- [~] F4 Testes automatizados (Vitest unit rodando; E2E Playwright pendente)
- [x] F5 PWA (ícone adaptável, manifesto completo, áreas seguras) — offline não implementado por risco de cache
- [~] F6 Acessibilidade e desempenho (índices aplicados; diálogos por prompt() ainda pendentes)
- [~] F7 Observabilidade e dados (robots/noindex e limpeza de auditoria prontos; exportar/excluir conta pendente)


## Pendente com o usuário
- Trocar senha do administrador (mecanismo seguro)
- Credenciais de TESTE da Pagar.me + webhook (cofre de segredos)
- Dados reais da loja, termos/privacidade, domínio, backup do plano
