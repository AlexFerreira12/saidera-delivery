# Roadmap

## Bloco F — Qualidade, PWA e produção (concluído)

- [x] F1 Segurança final (HIBP + senha atual, limite de abuso no webhook, cabeçalhos; view products_admin mantida como SECURITY DEFINER por causa das permissões de coluna)
- [x] F2 Imagens no armazenamento próprio (bucket privado "catalogo" + upload admin + rota pública de leitura)
- [x] F3 Rede ruim (timeout + retry nas chamadas ao provedor, bloqueio de duplo envio no upload)
- [x] F4 Testes automatizados (Vitest 15 testes + Playwright 6 E2E, sem cobrança real)
- [x] F5 PWA (ícone adaptável, manifesto, áreas seguras, service worker só de casca/assets com página offline e chave ?sw=off)
- [x] F6 Acessibilidade e desempenho (índices aplicados; diálogos acessíveis no lugar de prompt(); alvos de toque 44px)
- [x] F7 Observabilidade e dados (x-request-id nos erros do servidor, robots/noindex, exportar e encerrar conta, retenção configurável desligada, docs/operacao-backup-e-golive.md)


## Pendente com o usuário
- Trocar senha do administrador (mecanismo seguro; nunca pelo chat)
- Credenciais de TESTE da Pagar.me + usuário/senha do aviso (cofre de segredos)
- Dados reais da loja, termos/privacidade, domínio, confirmação do backup do plano
- Decidir o prazo de retenção da auditoria antes de ligar purge_old_audit_data

## Rebrand SAIDERA (em andamento)
- [x] Tokens globais claros/premium (marfim, grafite, dourado pontual; Manrope)
- [x] Home/vitrine pública na nova identidade + BrandLogo via Storage (catalogo/branding/saidera-logo.png)
- [ ] Propagar identidade às demais telas (aguardando avaliação)

## Imagens automáticas de produtos (concluído)
- [x] Busca por GTIN no Open Food Facts (server-side, dígito verificador, correspondência exata)
- [x] Importação protegida p/ bucket catalogo (HTTPS + hosts permitidos, 3 MB, magic bytes) + proveniência (tabela product_image_provenance)
- [x] Admin > Produtos: busca individual com confirmação, lote só p/ produtos sem imagem, campo código de barras no cadastro
- [x] Diagnóstico do erro de download: rede do sandbox bloqueia images.openfoodfacts.org; código correto. Resumo do lote mostra produto + motivo amigável
- [x] Fallback oficial: cadeia .org → espelho images.openfoodfacts.net → foto original por imgid; estado "imagem inalcançável" quando nenhum caminho responde; validado ponta a ponta no preview (download → storage → proveniência)
- [ ] Validar 1 aplicação real após publicar (imagem frontal atual só existe no host primário, bloqueado no sandbox)
