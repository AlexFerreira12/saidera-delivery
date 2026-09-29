# Cobertura de entrega — Guariba/SP

## Baseline de staging

A cobertura urbana usada nos testes de staging foi reconstruída a partir da delimitação municipal e convertida para latitude/longitude para validação do motor de geofence.

- O conjunto de teste possui 43 vértices.
- Ele é uma **baseline de staging**, não um seed automático de produção.
- O perímetro deve ser revisado administrativamente antes do deploy.
- Áreas urbanizáveis, de expansão urbana e loteamentos regularmente aprovados podem exigir atualização da cobertura mesmo quando uma base cartográfica pública ainda estiver desatualizada.
- Endereços urbanos novos continuam suportados pelo fluxo de revisão/override administrativo.
- Zona rural e outros municípios permanecem fora da política de entrega.

## Regra operacional

A decisão final de elegibilidade é feita no servidor. O cliente não pode definir sozinho cidade, taxa ou elegibilidade apenas movendo o pino do mapa.

A taxa padrão é R$ 5,99. Promoção de frete grátis existe como configuração, mas inicia desativada.

## Implantação

Antes de produção:

1. revisar o perímetro vigente e loteamentos/expansões aprovados;
2. desenhar/confirmar os polígonos no painel administrativo;
3. validar pontos internos, externos e de borda;
4. validar mobile e desktop;
5. implantar as RPCs de cobertura, checkout e entregador junto do frontend dependente delas.
