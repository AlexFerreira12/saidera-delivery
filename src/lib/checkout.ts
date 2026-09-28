import { brl } from "@/lib/format";

/** Mensagens amigáveis para os códigos de erro retornados pela RPC create_order. */
export function checkoutErrorMessage(raw: unknown): string {
  const message =
    typeof raw === "string" ? raw : ((raw as { message?: string } | null)?.message ?? "");
  const [code = "", detail = ""] = message.split(":");
  const key = code.replace(/^.*?([A-Z_]+)$/, "$1").trim();

  switch (key) {
    case "NAO_AUTENTICADO":
      return "Entre na sua conta para finalizar o pedido.";
    case "CARRINHO_VAZIO":
      return "Seu carrinho está vazio.";
    case "LOJA_FECHADA":
      return "A loja está fechada no momento. Tente novamente no horário de funcionamento.";
    case "PIX_INDISPONIVEL":
      return "Pagamento por PIX online está temporariamente indisponível.";
    case "PAGAMENTO_INVALIDO":
      return "Forma de pagamento inválida.";
    case "ENDERECO_INVALIDO":
      return "Selecione um endereço de entrega válido.";
    case "FORA_DA_AREA":
      return "Não foi possível validar a entrega neste endereço de Guariba. Entre em contato com a loja.";
    case "QUANTIDADE_INVALIDA":
      return "Quantidade inválida em um dos itens.";
    case "PRODUTO_INDISPONIVEL":
      return `Produto indisponível: ${detail || "item do carrinho"}.`;
    case "ESTOQUE_INSUFICIENTE":
      return `Estoque insuficiente para ${detail || "um dos itens"}. Ajuste a quantidade.`;
    case "PEDIDO_MINIMO":
      return `Pedido mínimo de ${brl(Number(detail || 0))} para esse bairro.`;
    case "CUPOM_INVALIDO":
      return "Cupom inválido.";
    case "CUPOM_NAO_VIGENTE":
      return "Esse cupom ainda não está válido.";
    case "CUPOM_EXPIRADO":
      return "Cupom expirado.";
    case "CUPOM_ESGOTADO":
      return "Cupom esgotado.";
    case "CUPOM_JA_USADO":
      return "Você já usou esse cupom.";
    case "CUPOM_PRIMEIRA_COMPRA":
      return "Esse cupom é válido apenas na primeira compra.";
    case "CUPOM_MINIMO":
      return `Esse cupom exige pedido mínimo de ${brl(Number(detail || 0))}.`;
    case "SEM_PERMISSAO":
      return "Você não tem permissão para essa ação.";
    case "PEDIDO_FINALIZADO":
      return "Esse pedido já foi finalizado.";
    case "PEDIDO_NAO_ENCONTRADO":
      return "Pedido não encontrado.";
    case "ENTREGA_JA_ACEITA":
      return "Outro entregador já aceitou essa entrega.";
    case "ENTREGADOR_NAO_CADASTRADO":
      return "Seu cadastro de entregador ainda não foi criado pelo administrador.";
    case "PEDIDO_NAO_DISPONIVEL":
      return "Esse pedido não está disponível para entrega.";
    default:
      return "Não foi possível concluir. Tente novamente.";
  }
}

export const COUPON_STORAGE_KEY = "bg.coupon";
