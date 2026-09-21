# Bloco F — Qualidade, PWA e prontidão para produção (auditoria + plano, sem implementação)

Auditoria feita sobre o projeto real após P0/A/B/C/D/E. Nada foi alterado: nenhuma migração, nenhum deploy, nenhuma credencial.

## 1. O que já está correto

- Pedido, preço, cupom, estoque e pagamento são decididos no servidor; o navegador não define valores.
- Estoque tem histórico auditável e devolução única em cancelamento/expiração.
- Entrega tem código de 4 dígitos com segredo de servidor, apagado ao entregar/cancelar; entregador nunca vê o código.
- Pagamento PIX só é confirmado por consulta ao provedor; aviso repetido, atrasado ou com valor divergente não corrompe o estado.
- Acesso ao banco fechado por perfil (cliente, entregador, administrador), com funções administrativas restritas.
- Aplicativo já tem arquivo de instalação (nome, cores, ícones 192/512) e páginas públicas com título/descrição próprios.
- Índices já existem nas consultas de fila do entregador, idempotência de pedido, cobrança e histórico de estoque.

## 2. Achados por severidade

### P0 (bloqueia ir ao ar)
1. **Credencial administrativa exposta no histórico da conversa** — a senha do administrador foi digitada no chat e é fraca. Precisa ser trocada por mecanismo seguro antes de qualquer acesso real.
2. **Sem chaves Pagar.me e sem endereço de aviso configurado** — PIX aparece para o cliente mas não gera cobrança. Precisa de ambiente de teste completo antes de produção.
3. **Sem testes automatizados** — nenhuma rede de proteção para checkout, estoque, pagamento e entrega; qualquer ajuste futuro pode quebrar regras críticas em silêncio.

### P1 (alto)
4. **Sem limite de tentativas em login e nos endpoints públicos** — o endereço público de aviso de pagamento e a tela de entrada aceitam repetição ilimitada.
5. **Imagens só por endereço externo (URL)** — produtos e banners dependem de links de terceiros: podem sumir, mudar ou apontar para conteúdo indevido; não há upload próprio nem validação.
6. **Páginas privadas indexáveis** — o arquivo de robôs libera tudo; painel, entregador, pedidos, pagamento e conta deveriam ficar fora de buscadores.
7. **Sem tempo limite nas chamadas ao provedor de pagamento** — uma resposta lenta pode travar a tela sem mensagem.
8. **Reconexão em tempo real sem fallback padronizado** — quatro telas usam atualização ao vivo; queda de sinal pode deixar a tela desatualizada (só a de pagamento tem repetição por tempo).
9. **Sem registro de erros do servidor com identificador de requisição** — hoje uma falha no aviso de pagamento vira só um texto no log, difícil de rastrear.

### P2 (médio / desejável)
10. Visão administrativa de produtos usa uma consulta com privilégio elevado (filtrada por administrador — correta, mas melhor trocar por permissão comum).
11. Contatos da loja (telefone/WhatsApp) são legíveis publicamente — esperado para uma loja, apenas confirmar que nenhum campo interno entrou nessa tabela.
12. Listagens administrativas (pedidos, clientes, pagamentos, histórico) carregam blocos grandes sem paginação real.
13. Busca de produtos só por nome, sem acento-insensível nem índice de texto.
14. Faltam índices em "pedidos do cliente" (usuário + data) e em "produtos por categoria ativa".
15. Acessibilidade: diálogos por `prompt()` do navegador no painel, ícones sem rótulo, foco não visível em alguns botões, alvos de toque pequenos em listas densas.
16. Sem página de erro offline nem aviso de "sem conexão".
17. Sem exportação/exclusão de conta pelo próprio cliente; sem prazo de retenção definido para eventos de pagamento e auditorias.
18. Sem procedimento escrito de backup/recuperação nem verificação do que o plano atual da nuvem oferece.

## 3. Plano proposto (7 etapas, nesta ordem)

### F1 — Segurança final e limites de abuso
- Trocar a credencial administrativa (pelo cofre de segredos / redefinição de senha, nunca pelo chat) e revisar quem tem perfil de administrador.
- Ativar proteção contra senha vazada e exigência de senha atual na troca.
- Limite de tentativas: entrada no app, código de entrega (já tem 5 tentativas) e endereço público de aviso de pagamento (contagem por origem, com registro).
- Revisão final de permissões: confirmar que nenhuma função interna é executável sem login, trocar a consulta administrativa de produtos por permissão comum + regra de administrador, conferir que nenhuma chave aparece no pacote enviado ao navegador.
- Cabeçalhos de segurança na resposta do site (política de conteúdo compatível com o app, proteção contra enquadramento e detecção de tipo).
- Migração possível: 1 (ajuste da consulta administrativa de produtos + tabela de contagem de tentativas do endereço público).

### F2 — Imagens com armazenamento próprio
- Criar depósito de imagens de produtos e banners: envio somente por administrador, leitura pública, tipos permitidos apenas JPEG/PNG/WebP (sem SVG), limite de tamanho, nome gerado pelo servidor e remoção segura ao trocar/excluir.
- Telas de produtos e banners ganham envio de arquivo mantendo o campo de endereço como alternativa.
- Migração/configuração: criação do depósito e suas regras.

### F3 — Rede ruim e resiliência
- Tempo limite e nova tentativa nas chamadas ao provedor de pagamento e nas funções de servidor.
- Bloqueio de duplo toque padronizado em: finalizar pedido, gerar/renovar PIX, "já paguei", aceitar entrega, confirmar código, e todas as operações de estoque e painel.
- Reconexão ao vivo com repetição por tempo como rede de segurança nas quatro telas que usam atualização automática.
- Mensagens claras de "sem conexão" e botão de tentar de novo.

### F4 — Testes automatizados
- Ferramentas a adicionar: Vitest (unidade/integração) e Playwright (ponta a ponta), com um arquivo de comandos e um ambiente de teste que substitui o provedor de pagamento por um simulador local — nunca cobrança real.
- Unidade: cálculo de preço/promoção, taxa e mínimo por bairro, estimativa de cupom, tradução de mensagens de erro, contagem regressiva do PIX, formatação.
- Integração no banco (transação desfeita ao final, como já usamos nos blocos C, D e E): criação de pedido, idempotência, baixa/devolução de estoque, transições de status, código de entrega, aplicação de status de pagamento.
- Ponta a ponta: cadastro/entrada, catálogo e carrinho, pedido pago na entrega, pedido PIX com provedor simulado, acompanhamento do pedido, administrador avançando o pedido, entregador aceitando e confirmando com código, e tentativas de acesso indevido entre perfis.
- Critério: toda regra crítica dos blocos P0–E coberta por pelo menos um teste.

### F5 — Instalação no celular e experiência móvel
- Manter a instalação já existente e completar: ícone recortável (maskable), ícone da Apple no tamanho certo, captura de tela para a instalação no Android, cor da barra e áreas seguras do iPhone.
- Trabalho offline mínimo e seguro: apenas o esqueleto do app e arquivos estáticos; **nunca** guardar pedidos, pagamentos, código de entrega, dados pessoais ou respostas autenticadas. Páginas sempre buscam a rede primeiro, com página de erro offline.
- Registro do modo offline desativado na pré-visualização do editor e chave de desligamento, conforme a skill de PWA.
- Ajustes móveis: teclado numérico no código de entrega e no PIX, botão de copiar e de abrir o QR, ligar/rotas com um toque, tabelas do painel utilizáveis no celular.

### F6 — Acessibilidade, desempenho e banco
- Acessibilidade sem redesenho: rótulos em todos os campos e ícones, foco visível, navegação por teclado, substituição dos diálogos do navegador por caixas acessíveis, anúncio de status (pedido mudou, pagamento confirmado), contraste conferido e alvos de toque de 44px.
- Desempenho: medir primeiro (tamanho do pacote e tempo das rotas), depois carregar sob demanda o painel e as telas pesadas; imagens com tamanho/carregamento adequado; paginação real nas listagens administrativas.
- Banco: dois índices novos (pedidos por cliente e data; produtos por categoria ativa), busca acento-insensível e revisão dos planos das consultas mais usadas. Sem tocar em checkout/estoque.
- Migração possível: 1 (índices + busca).

### F7 — Observabilidade, dados e go-live
- Registro de erros com identificador de requisição no servidor e captura no navegador, sempre sem segredos, dados pessoais ou código de entrega (filtro explícito).
- Retenção: definir prazo para eventos de pagamento, auditorias de entrega e registros de erro, com limpeza agendada.
- Dados do cliente: exportar meus dados e excluir conta (anonimizando pedidos, que precisam ser mantidos por obrigação fiscal/contábil).
- Indexação: liberar apenas páginas públicas (início, categorias, produto), bloquear painel/entregador/conta/pedidos/pagamento.
- Configuração da loja: revisar horários, aberto/fechado, zonas, taxa/mínimo, meios de pagamento e contatos reais, eliminando valores fixos no código.
- Backup: confirmar o que o plano atual da nuvem oferece (sem afirmar sem checar), migrações versionadas já existem, e escrever o passo a passo de recuperação e desfazer lógico.

## 4. Checklist de go-live

**Podemos automatizar/eu faço:** testes automatizados, instalação/offline seguro, limites de abuso, cabeçalhos, imagens no armazenamento próprio, índices, acessibilidade, indexação, registro de erros, retenção, exportar/excluir conta, checklist escrito de recuperação.

**Exige você (humano):**
1. Trocar a senha do administrador pelo mecanismo seguro e revisar quem é administrador.
2. Cadastrar as credenciais **de teste** da Pagar.me no cofre de segredos (nunca no chat).
3. Configurar o endereço de aviso de pagamento no painel da Pagar.me com usuário/senha de aviso.
4. Rodar o fluxo ponta a ponta em teste (pedido → QR → pagamento simulado → confirmação → entrega com código).
5. Só então trocar para as credenciais de produção e refazer um pedido real pequeno.
6. Domínio próprio e HTTPS.
7. Dados reais da loja: horários, bairros/taxas, telefone, WhatsApp, endereço, pedido mínimo.
8. Textos de termos de uso e privacidade (conteúdo jurídico é seu; eu só publico a página).
9. Confirmar a política de backup do plano contratado.
10. Teste de fumaça final no aplicativo publicado, com uma conta de cliente, uma de entregador e a de administrador.

## 5. Critérios de aceite

- Todos os testes automatizados passando, incluindo os nove fluxos ponta a ponta, sem nenhuma cobrança real.
- Nenhuma resposta autenticada, pedido, pagamento, dado pessoal ou código de entrega guardado no dispositivo.
- Nenhuma função interna executável sem login; nenhuma chave no pacote do navegador; verificação de segurança sem alerta novo.
- App instalável no Android e adicionável à tela do iPhone, com atualização automática ao publicar nova versão.
- Páginas privadas fora dos buscadores; páginas públicas com título, descrição e prévia corretos.
- Checklist humano acima concluído e registrado.

## 6. Riscos e desfazer

- Modo offline é a parte com maior risco de tela velha: entra com chave de desligamento e trocável por uma versão de limpeza em um lançamento, conforme a skill de PWA.
- Cabeçalhos de segurança podem bloquear recursos legítimos: entram em modo de observação antes de bloquear.
- Índices e novas regras de imagem são aditivos; as migrações continuam versionadas e reversíveis logicamente.
- Nada de checkout, estoque, entrega ou pagamento será reescrito neste bloco.

**Sequência recomendada:** F1 → F2 → F3 → F4 → F5 → F6 → F7, com o checklist humano começando já no F1 (troca de credencial) e as credenciais de teste da Pagar.me antes do F4.
