# SAIDERA DELIVERY

Crie uma aplicação web/PWA mobile-first completa e profissional para uma distribuidora de bebidas e conveniência localizada em Guariba/SP.

O aplicativo deve ter experiência semelhante aos grandes aplicativos modernos de delivery, porém com identidade visual própria e sem copiar marcas, nomes, layouts, textos, ícones ou elementos protegidos de terceiros.

O objetivo é permitir que clientes façam pedidos pelo celular, realizem o pagamento online e acompanhem todo o processo de entrega.

ESTRUTURA GERAL

O sistema deve possuir três ambientes diferentes:

Aplicativo do Cliente

Painel Administrativo

Área do Entregador

Utilizar Supabase para:

autenticação;

banco de dados;

armazenamento de imagens;

gerenciamento de usuários;

pedidos;

produtos;

endereços;

entregadores;

pagamentos;

cupons;

promoções;

notificações;

histórico de pedidos.

O projeto deve ser desenvolvido de forma organizada, escalável e preparado para futuras integrações via API.

1. APLICATIVO DO CLIENTE

Criar uma interface mobile-first extremamente simples, rápida e moderna.

Tela inicial

No topo mostrar:

logo da distribuidora;

endereço atual de entrega;

botão para alterar endereço;

ícone do perfil;

ícone do carrinho.

Logo abaixo:

Campo de pesquisa:

"Buscar produtos"

Criar banners de promoções que possam ser configurados pelo painel administrativo.

Exemplos:

Ofertas do dia

Entrega rápida

Combos

Refrigerantes gelados

Energéticos

Petiscos

Criar categorias horizontais navegáveis.

Categorias iniciais:

Refrigerantes

Água

Energéticos

Sucos

Isotônicos

Gelo

Carvão

Petiscos

Combos

Promoções

Essas categorias devem ser cadastráveis e editáveis pelo administrador.

PRODUTOS

Cada produto deverá possuir:

foto;

nome;

descrição;

marca;

categoria;

volume;

preço normal;

preço promocional;

estoque;

quantidade disponível;

indicação de produto gelado ou temperatura ambiente;

destaque;

status ativo/inativo.

Exemplo:

Coca-Cola Original 2L

Gelada

R$ 11,99

Botão:

ADICIONAR

Após adicionar, substituir pelo controle:

1  +

Permitir aumentar ou diminuir a quantidade rapidamente.

PÁGINA DO PRODUTO

Ao tocar no produto abrir uma página/modal mostrando:

imagem grande;

nome;

descrição;

volume;

preço;

preço promocional;

quantidade;

disponibilidade;

produtos relacionados.

Botão destacado:

ADICIONAR AO CARRINHO

CARRINHO

Criar carrinho persistente.

Mostrar:

Produto

Quantidade

Preço unitário

Subtotal

Permitir aumentar ou diminuir quantidade.

Mostrar resumo:

Subtotal

Desconto

Taxa de entrega

Total

Campo:

"Adicionar cupom"

Botão principal:

CONTINUAR

CADASTRO DO CLIENTE

Permitir cadastro utilizando:

nome completo;

CPF;

telefone;

e-mail;

senha.

Preparar estrutura para futuramente permitir:

login Google;

login Apple;

login por telefone/OTP.

O telefone deverá ser validado.

ENDEREÇOS

Permitir que cada cliente cadastre vários endereços.

Campos:

CEP;

rua;

número;

complemento;

bairro;

cidade;

ponto de referência.

A cidade inicial de operação será:

Guariba/SP.

Criar endereço:

Casa

Trabalho

Outro

Permitir definir endereço padrão.

Preparar o sistema para futura integração com Google Maps ou outra API de mapas.

ÁREA DE ENTREGA

Criar sistema de área de atendimento.

Inicialmente:

Guariba/SP.

O administrador deverá conseguir configurar:

bairros atendidos;

taxa de entrega;

pedido mínimo;

raio de atendimento;

tempo estimado de entrega.

Exemplo:

Centro

Taxa R$ 4,99

Outro bairro

Taxa R$ 6,99

Também permitir configurar:

Entrega grátis acima de determinado valor.

Exemplo:

"Entrega grátis acima de R$ 80"

CHECKOUT

Criar checkout simples dividido em etapas.

Endereço

Entrega

Pagamento

Confirmação

Mostrar:

Endereço selecionado

Tempo estimado

Produtos

Subtotal

Taxa de entrega

Cupom

Descontos

Total

PAGAMENTO

Criar arquitetura preparada para integração com gateway de pagamento.

Métodos:

PIX

Cartão de crédito

Cartão de débito online, se disponível pelo gateway

Permitir também configurar:

Pagamento na entrega

O sistema não deve armazenar dados completos do cartão.

Criar camada de integração separada para gateway de pagamento.

Após confirmação do pagamento alterar automaticamente o pedido para:

PAGAMENTO APROVADO

No PIX, criar estrutura preparada para receber:

QR Code

Código PIX copia e cola

Status do pagamento.

PEDIDO

Após o pagamento gerar número único do pedido.

Exemplo:

Pedido #1048

Mostrar tela:

Pedido confirmado!

E uma linha do tempo.

Pedido recebido

Preparando pedido

Saiu para entrega

Entregue

Cada etapa deverá possuir horário.

RASTREAMENTO DA ENTREGA

Criar tela:

"Acompanhar pedido"

Mostrar:

Status atual

Entregador responsável

Tempo estimado

Linha do tempo

Preparar arquitetura para futuramente mostrar localização do entregador em tempo real no mapa.

Quando houver localização disponível mostrar:

mapa

localização da loja

localização do entregador

endereço do cliente

tempo estimado.

Não é necessário implementar API de mapas neste primeiro momento.

Deixar a estrutura preparada.

HISTÓRICO

Na conta do cliente criar:

MEUS PEDIDOS

Mostrar:

Número

Data

Valor

Status

Botão:

VER PEDIDO

Botão:

PEDIR NOVAMENTE

Ao clicar em pedir novamente adicionar os produtos disponíveis daquele pedido ao carrinho.

FAVORITOS

Permitir favoritar produtos.

Criar seção:

"Meus favoritos"

COMPRAR NOVAMENTE

Na página inicial mostrar automaticamente:

"Comprar novamente"

Utilizando produtos dos últimos pedidos do cliente.

PROMOÇÕES

Criar sistema completo de promoções.

Tipos:

Preço promocional

Desconto percentual

Desconto em reais

Compre X e leve Y

Combo

Frete grátis

Promoção por quantidade

Exemplo:

Coca-Cola 2L

1 unidade: R$ 11,99

3 unidades: R$ 10,99 cada

6 unidades: R$ 9,99 cada

O sistema deverá calcular automaticamente o preço de acordo com a quantidade.

Essa função é especialmente importante para a distribuidora, pois o modelo de negócio trabalha com vendas em quantidade.

COMBOS

Permitir criar combos.

Exemplo:

COMBO CHURRASCO

2 Coca-Cola 2L

1 saco de gelo

1 carvão

2 salgadinhos

Preço normal: R$ 72

Combo: R$ 64,90

Mostrar economia:

"Economize R$ 7,10"

CUPONS

Criar sistema de cupons.

Campos:

Código

Tipo de desconto

Valor

Pedido mínimo

Data inicial

Data final

Quantidade máxima de usos

Uso máximo por cliente

Primeira compra ou todos clientes

Exemplos:

PRIMEIRACOMPRA

10% OFF

FRETEGRATIS

PROGRAMA DE FIDELIDADE

Deixar o banco de dados preparado para programa de pontos.

Exemplo:

R$ 1 gasto = 1 ponto.

Criar tabelas para:

saldo de pontos

entrada de pontos

resgate

validade

histórico.

Não é necessário ativar inicialmente.

NOTIFICAÇÕES

Preparar sistema de notificações push.

Exemplos:

"Seu pedido foi confirmado."

"Estamos preparando seu pedido."

"Seu pedido saiu para entrega."

"Seu pedido chegou!"

Também permitir notificações promocionais.

Exemplo:

"Tem Coca-Cola gelada em promoção hoje 👀"

Administradores deverão futuramente conseguir enviar campanhas segmentadas.

PERFIL DO CLIENTE

Criar página:

MINHA CONTA

Opções:

Meus pedidos

Favoritos

Endereços

Cupons

Programa de fidelidade

Dados pessoais

Ajuda

Política de privacidade

Termos de uso

Sair

2. PAINEL ADMINISTRATIVO

Criar painel administrativo separado.

URL protegida:

/admin

Somente usuários administradores poderão acessar.

Dashboard inicial mostrando:

Faturamento hoje

Faturamento no mês

Pedidos hoje

Ticket médio

Pedidos em andamento

Pedidos entregues

Pedidos cancelados

Clientes cadastrados

Produtos mais vendidos

Horários com mais pedidos

GESTÃO DE PEDIDOS

Criar tela estilo Kanban.

Colunas:

NOVOS

PAGAMENTO APROVADO

PREPARANDO

PRONTO

SAIU PARA ENTREGA

ENTREGUE

CANCELADO

Permitir alterar o status rapidamente.

Quando o status mudar, atualizar automaticamente o aplicativo do cliente.

DETALHES DO PEDIDO

Mostrar:

Número

Cliente

Telefone

Endereço

Produtos

Quantidades

Observações

Forma de pagamento

Status do pagamento

Subtotal

Taxa de entrega

Descontos

Total

Horário

Entregador

Permitir:

imprimir pedido;

atribuir entregador;

alterar status;

cancelar pedido.

PRODUTOS

Criar CRUD completo.

Adicionar

Editar

Excluir

Ativar

Desativar

Campos:

Nome

Categoria

Marca

Descrição

Imagem

Código interno

Código de barras

Custo

Preço

Preço promocional

Estoque

Estoque mínimo

Unidade

Volume

Temperatura

Destaque

ESTOQUE

Quando um pedido for confirmado, diminuir automaticamente o estoque.

Caso o pedido seja cancelado, devolver os produtos ao estoque quando aplicável.

Criar alerta:

ESTOQUE BAIXO

Mostrar produtos abaixo do estoque mínimo.

CATEGORIAS

Administrador poderá:

Criar

Editar

Excluir

Ordenar

Ativar/desativar.

CLIENTES

Tela de clientes mostrando:

Nome

Telefone

E-mail

Quantidade de pedidos

Total gasto

Ticket médio

Última compra

Data de cadastro

Abrir perfil completo do cliente.

RELATÓRIOS

Criar relatórios:

Vendas por dia

Vendas por mês

Produtos mais vendidos

Categorias mais vendidas

Faturamento

Ticket médio

Clientes recorrentes

Novos clientes

Taxa de recompra

Horários de maior venda

Descontos concedidos

Taxas de entrega recebidas

Permitir filtrar por período.

CONFIGURAÇÕES DA LOJA

Criar página onde o administrador possa alterar:

Nome da loja

Logo

Telefone

WhatsApp

Endereço

Horário de funcionamento

Pedido mínimo

Tempo médio de entrega

Taxa de entrega

Frete grátis

Bairros atendidos

Formas de pagamento

Loja aberta/fechada.

Criar botão:

LOJA ABERTA

LOJA FECHADA

Quando estiver fechada, o cliente poderá visualizar os produtos, mas deverá receber aviso informando o próximo horário de funcionamento antes de tentar concluir o pedido.

3. ÁREA DO ENTREGADOR

Criar interface exclusiva para entregadores.

Login individual.

Mostrar:

ENTREGAS DISPONÍVEIS

MINHAS ENTREGAS

HISTÓRICO

Ao receber uma entrega mostrar:

Número do pedido

Endereço

Nome do cliente

Telefone

Observação

Botão:

INICIAR ENTREGA

Após iniciar:

MARCAR COMO ENTREGUE

Preparar arquitetura para coleta futura da geolocalização do entregador durante entregas ativas.

WHATSAPP

Adicionar botão de atendimento pelo WhatsApp.

Em pedidos, criar opção:

"Preciso de ajuda com este pedido"

Abrir conversa identificando o número do pedido.

DESIGN

O design deve transmitir:

rapidez

conveniência

confiança

preço competitivo

facilidade

Visual moderno e profissional.

Mobile-first.

Utilizar:

cards grandes

botões arredondados

tipografia moderna

fotos grandes dos produtos

poucos elementos por tela

navegação extremamente simples.

Criar menu inferior no celular com:

Início

Categorias

Pedidos

Favoritos

Conta

O carrinho deverá permanecer facilmente acessível.

Quando existirem produtos no carrinho, mostrar uma barra fixa inferior:

"Ver carrinho • 4 itens • R$ 57,80"

UX

Evitar excesso de páginas.

Comprar um produto deve exigir o menor número possível de cliques.

Priorizar:

velocidade

facilidade

conversão

recompra.

Utilizar skeleton loading durante carregamentos.

Criar estados de:

loading

erro

sem produtos

sem pedidos

sem conexão.

Mostrar feedback visual após todas as ações importantes.

RESPONSIVIDADE

O sistema deverá funcionar perfeitamente em:

Smartphones Android

iPhone

Tablet

Desktop

Prioridade absoluta para smartphone.

Criar como PWA instalável.

Preparar estrutura para futuramente transformar o projeto em aplicativo Android/iOS.

BANCO DE DADOS

Criar estrutura relacional no Supabase com, no mínimo, tabelas equivalentes a:

profiles

addresses

products

categories

product_images

orders

order_items

payments

delivery_zones

delivery_drivers

deliveries

coupons

coupon_usages

promotions

favorites

banners

notifications

store_settings

loyalty_accounts

loyalty_transactions

Criar relacionamentos e políticas de acesso adequadas.

Utilizar Row Level Security.

Clientes só podem visualizar e alterar dados pertencentes à própria conta.

Entregadores só podem visualizar entregas atribuídas a eles.

Administradores possuem acesso administrativo.

SEGURANÇA

Implementar:

Supabase Auth

RLS

rotas protegidas

validação de formulários

sanitização dos dados

controle de permissões por função.

Criar roles:

customer

driver

admin

Nunca expor service role key ou outras chaves secretas no frontend.

PREPARAÇÃO PARA INTEGRAÇÕES

Criar o projeto de maneira modular para futuramente integrar:

Gateway de pagamento

PIX

Google Maps

Geolocalização

WhatsApp

Push Notifications

Analytics

Sistema fiscal/NF

ERP

Controle de estoque externo.

Não simular integrações inexistentes como se fossem reais.

Quando uma integração ainda não estiver configurada, utilizar claramente dados mockados ou marcar como "Integração pendente".

IMPORTANTE

Antes de começar a desenvolver todas as funcionalidades avançadas, construa primeiro uma base sólida e funcional.

Prioridade da primeira versão:

Cadastro/login

Catálogo

Categorias

Pesquisa

Carrinho

Endereço

Checkout

Criação do pedido

Painel administrativo

Gestão de pedidos

Gestão de produtos

Estoque

Área do entregador

Histórico do cliente

Depois dessa base, implementar:

Gateway de pagamento

Rastreamento

Promoções

Cupons

Fidelidade

Push notifications

Relatórios avançados

Não criar apenas telas estáticas.

As principais funcionalidades devem possuir banco de dados e fluxo funcional.

Organizar o código utilizando componentes reutilizáveis.

Antes de modificar componentes globais, analisar o impacto nas outras páginas.

Não remover funcionalidades existentes para implementar novas funcionalidades.

O objetivo final é criar uma plataforma de delivery profissional, rápida, escalável e preparada para crescer junto com a operação.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4cbd5d5f-10ee-488b-925f-086635e2dcc5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
