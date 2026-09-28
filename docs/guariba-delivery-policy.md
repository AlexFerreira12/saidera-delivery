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

## Revisão de implementação em andamento
- SQL de revisão está em `docs/sql/guariba_citywide_delivery_REVIEW_ONLY.sql`, **fora** de `supabase/migrations`, para impedir implantação automática acidental.
- Nova tabela `delivery_address_approvals` é proposta com políticas RLS: somente administradores podem escrever; clientes consultam apenas o estado dos próprios endereços.
- Checkout da branch consulta a aprovação e os campos gerais da loja. **Ainda não publicar**: faltam interface administrativa de aprovação, geração dos tipos Supabase, validação do SQL em ambiente de testes e testes de ponta a ponta.
- O cadastro de endereços atual usa cidade/UF padrão Guariba/SP; para validar de forma robusta, a revisão humana deve conferir a localização, não apenas o texto informado.

## Mapa do cliente e navegação do entregador (aprovado)
- Cliente: localizar endereço no mapa, ajustar marcador, confirmar coordenadas; tecnologia de mapas ainda a configurar.
- Servidor: validar coordenadas contra polígono urbano revisado e aprovado pela loja; **não** confiar no resultado calculado no navegador, no nome da cidade nem apenas na precisão do geocodificador.
- Ausência de coordenadas, localização duvidosa ou rua nova fora do polígono cadastrado: enviar para revisão, sem tratar automaticamente como zona rural.
- Entregador: botão **Abrir no Waze** usando `wazeDeliveryUrl`; priorizar coordenadas confirmadas e usar endereço textual somente como alternativa.
- Função geométrica inicial `src/lib/delivery-geofence.ts` é utilitária para interface e testes; é necessário implementar validação equivalente no Supabase e desenhar o perímetro real antes de habilitar pedidos automáticos.
- Ainda faltam: provedor de mapas e suas credenciais, UI de marcador, editor administrativo do polígono, armazenamento/validação server-side, integração do botão Waze à tela real do entregador, testes e deploy coordenado. Não publicar esta branch ainda.

## Integração Waze implementada na branch
- A ação de rota já existente do entregador agora aponta para `wazeDeliveryUrl`, exibida como **Abrir no Waze**.
- A função prioriza latitude/longitude válidas, com fallback textual.
- O RPC atual `driver_my_orders` não devolve latitude/longitude. Alteração mínima preservando autorização existente preparada em `docs/sql/driver_waze_coordinates_REVIEW_ONLY.sql`; **não executada em produção**.
- Só publicar navegação por coordenadas após o cadastro permitir ao cliente confirmar o marcador e o backend preservar essas coordenadas no `address_snapshot`.
