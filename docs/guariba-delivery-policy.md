# Política de entrega — SAIDERA

- Área atendida: toda a área urbana de Guariba/SP, inclusive novos loteamentos e ruas ainda ausentes de bases de CEP/mapas.
- Não atender outros municípios nem área rural neste momento.
- Taxa única para todos os endereços elegíveis, configurável pelo administrador. Valor aprovado: **R$ 5,99** para toda a área urbana. O administrador poderá alterar esse valor futuramente. Frete grátis opcional, **desativado inicialmente** (`free_delivery_above = 0`).
- Bairro é texto livre; a ausência de cadastro de bairro não impede elegibilidade.
- A validação deve ocorrer no servidor: não confiar apenas em cidade/CEP informados pelo cliente. Para endereço novo sem geocodificação confiável, oferecer verificação manual de localização antes de confirmar o pedido.
- O banco deve expor a taxa única da loja e a validação da área urbana na RPC `create_order`; remover a exigência de correspondência exata com `delivery_zones.neighborhood` após a migração.
- O frontend ainda usa zonas antigas; não mostrar R$ 5,99 como preço definitivo nem liberar pedidos até a RPC usar o mesmo valor. O frontend ainda usa zonas antigas e bloqueia o checkout se não houver taxa configurada, evitando cobrança acidental de R$ 0. Não publicar esta branch até a migração do banco, adequação do checkout e testes ponta a ponta.
- Preservar as dependências e a sincronização existentes do Lovable/GitHub.

## Testes de aceitação
1. Endereço em bairro tradicional de Guariba: aceita e aplica taxa única.
2. Endereço em loteamento novo da área urbana: aceita, com verificação manual se necessária, e aplica a mesma taxa.
3. Endereço de outro município: recusa antes de criar pedido.
4. Endereço rural: recusa conforme política atual.
5. CEP desconhecido: não recusa automaticamente; solicita detalhes e validação.
6. Nenhum endereço sem taxa configurada pode gerar pedido gratuito por engano.
7. Todo endereço elegível deve receber exatamente R$ 5,99 de frete no cálculo do servidor e no checkout, antes de cupons ou promoções.
8. Não usar uma correspondência de bairro para determinar elegibilidade ou valor do frete.

## Auditoria do Supabase (consulta somente leitura)
- `store_settings.default_delivery_fee` já está em R$ 5,99.
- `store_settings.free_delivery_above` está em R$ 100,00; decidir se a promoção de frete grátis continua antes de migrar a RPC.
- A RPC atual `create_order` ainda consulta `delivery_zones` por nome do bairro, utiliza `v_zone.fee`, `v_zone.min_order` e `v_zone.eta_minutes`; migrar esses três campos para configurações da loja.
- Índice único parcial `orders_client_request_uidx` em `(user_id, client_request_id)` foi confirmado, ajudando a evitar duplicação concorrente.
- Checagem apenas de cidade/UF não distingue zona urbana de rural. Exigir validação confiável de perímetro urbano ou revisão manual, sem bloquear automaticamente ruas novas.
- Nenhuma modificação de produção realizada durante a auditoria.

## Alteração aplicada em produção
- `store_settings.free_delivery_above` passou de R$ 100,00 para **0** em 27/09/2026, conforme autorização do proprietário. A condição atual da RPC `v_store.free_delivery_above > 0` preserva a possibilidade de reativação futura.
- Taxas por bairro ainda permanecem ativas na RPC antiga: não considerar a migração de frete fixo concluída.
