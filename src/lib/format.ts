export const brl = (value: number | null | undefined) =>
  (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dateTimeBR = (value: string | Date | null | undefined) => {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const timeBR = (value: string | Date | null | undefined) => {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

export const onlyDigits = (v: string) => v.replace(/\D/g, "");

export const maskPhone = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10)
    return d
      .replace(/(\d{2})(\d{0,4})(\d{0,4})/, (_, a, b, c) =>
        [a && `(${a})`, b, c && `-${c}`].filter(Boolean).join(" "),
      )
      .trim();
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
};

export const maskCPF = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

export const isValidPhone = (v: string) => onlyDigits(v).length >= 10;
export const isValidCPF = (v: string) => onlyDigits(v).length === 11;
