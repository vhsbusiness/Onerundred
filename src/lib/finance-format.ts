export type FinanceSpace = "personal" | "business";
export const spaceNames = { personal: "Pessoal", business: "Empresa" };
export const kindNames = { income: "Receita", expense: "Despesa", transfer: "Transferência" };
export type EntryKind = keyof typeof kindNames;
export const suggestions = {
  personal: {
    income: ["Salário", "Renda extra"],
    expense: ["Alimentação", "Moradia", "Saúde", "Transporte", "Lazer"],
  },
  business: {
    income: ["Vendas", "Serviços"],
    expense: ["Fornecedores", "Marketing", "Impostos", "Equipe", "Operação"],
  },
};
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (cents: number) => currency.format(cents / 100);
export const decimal = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
export const categoryLabel = (value: string) => value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
export const validMonth = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export function parseMoney(value: unknown, signed = false) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  // Allow Brazilian thousands separators and decimal commas, or an ungrouped decimal point.
  if (!/^-?(?:\d+([.,]\d{1,2})?|\d{1,3}(\.\d{3})+(,\d{1,2})?)$/.test(raw)) return null;
  const normalized =
    raw.includes(",") || /\.\d{3}$/.test(raw) ? raw.replaceAll(".", "").replace(",", ".") : raw;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && Math.abs(cents) <= 2147483647 && (signed || cents > 0) ? cents : null;
}
