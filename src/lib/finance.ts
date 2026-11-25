import { listSavings, writeSavings } from "./savings";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { parseMoney, validMonth, type FinanceSpace } from "./finance-format";
import { requireDay, shortText } from "./organizer-input";

export function financeSpace(value: unknown): FinanceSpace {
  if (value !== "personal" && value !== "business") throw new ApiError(400, "Escolha Pessoal ou Empresa.");
  return value;
}
export async function financeOverview(userId: string, space: FinanceSpace, month: string) {
  if (!validMonth(month)) throw new ApiError(400, "Mês inválido.");
  const owner = { userId, space };
  const end = month + "-31";
  const where = { account: owner, settled: true, dayKey: { lte: end } };
  const [accounts, entries, budgets, totals, transfers] = await prisma.$transaction([
    prisma.financeAccount.findMany({
      where: owner,
      orderBy: { name: "asc" },
      select: { id: true, name: true, openingCents: true },
    }),
    prisma.financeEntry.findMany({
      where: { account: owner, dayKey: { gte: month + "-01", lte: end } },
      orderBy: [{ dayKey: "desc" }, { id: "desc" }],
    }),
    prisma.financeBudget.findMany({ where: { ...owner, month }, orderBy: { category: "asc" } }),
    prisma.financeEntry.groupBy({
      by: ["accountId", "kind"],
      orderBy: { accountId: "asc" },
      where,
      _sum: { cents: true },
    }),
    prisma.financeEntry.groupBy({
      by: ["destinationId"],
      orderBy: { destinationId: "asc" },
      where: { ...where, kind: "transfer" },
      _sum: { cents: true },
    }),
  ]);
  const balances = new Map(accounts.map((a) => [a.id, a.openingCents]));
  for (const row of totals) {
    const amount = (row._sum?.cents ?? 0) * (row.kind === "income" ? 1 : -1);
    balances.set(row.accountId, (balances.get(row.accountId) ?? 0) + amount);
  }
  for (const row of transfers)
    if (row.destinationId)
      balances.set(row.destinationId, (balances.get(row.destinationId) ?? 0) + (row._sum?.cents ?? 0));
  return { accounts: accounts.map((a) => ({ ...a, balance: balances.get(a.id)! })), entries, budgets, savings: await listSavings(userId, space) };
}
export type FinanceOverview = Awaited<ReturnType<typeof financeOverview>>;
type Body = Record<string, unknown>;
function amount(value: unknown, signed = false) {
  const cents = parseMoney(value, signed);
  if (cents === null)
    throw new ApiError(400, "Informe um valor válido em reais, com até duas casas decimais.");
  return cents;
}
function found(count: number) {
  if (!count) throw new ApiError(404, "Registro não encontrado neste espaço.");
}
export async function writeFinance(
  userId: string,
  space: FinanceSpace,
  resource: string,
  method: string,
  body: Body,
) {
  if (resource === "metas" || resource === "registros-meta") return writeSavings(userId, space, resource, method, body);
  const owner = { userId, space };
  const id = method === "POST" ? undefined : shortText(body.id, "identificador");
  if (resource === "contas" && method !== "DELETE") {
    const data = {
      name: shortText(body.name, "nome da conta", 60),
      openingCents: amount(body.opening, true),
    };
    try {
      if (id) found((await prisma.financeAccount.updateMany({ where: { ...owner, id }, data })).count);
      else await prisma.financeAccount.create({ data: { ...owner, ...data } });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002")
        throw new ApiError(409, "Já existe uma conta com esse nome neste espaço.");
      throw error;
    }
    return;
  }
  if (resource === "limites") {
    if (method === "DELETE") {
      found((await prisma.financeBudget.deleteMany({ where: { id, ...owner } })).count);
      return;
    }
    if (method !== "POST" || !validMonth(body.month)) throw new ApiError(400, "Confira o mês do limite.");
    const category = shortText(body.category, "categoria", 60).toLocaleLowerCase("pt-BR");
    const key = { ...owner, month: body.month, category };
    const cents = amount(body.amount);
    await prisma.financeBudget.upsert({
      where: { userId_space_month_category: key },
      create: { ...key, cents },
      update: { cents },
    });
    return;
  }
  if (resource !== "lancamentos") throw new ApiError(404, "Operação indisponível.");
  const where = { id, account: owner };
  if (method === "DELETE") {
    found((await prisma.financeEntry.deleteMany({ where })).count);
    return;
  }
  const { kind, settled } = body;
  if (kind !== "income" && kind !== "expense" && kind !== "transfer")
    throw new ApiError(400, "Tipo de lançamento inválido.");
  if (typeof settled !== "boolean") throw new ApiError(400, "Informe a situação do lançamento.");
  const accountId = shortText(body.accountId, "conta");
  const destinationId = kind === "transfer" ? shortText(body.destinationId, "conta de destino") : null;
  if (accountId === destinationId) throw new ApiError(400, "Escolha duas contas diferentes.");
  const ids = destinationId ? [accountId, destinationId] : [accountId];
  const data = {
    kind,
    settled,
    accountId,
    destinationId,
    title: shortText(body.title, "descrição", 160),
    category: kind === "transfer" ? "" : shortText(body.category, "categoria", 60).toLocaleLowerCase("pt-BR"),
    cents: amount(body.amount),
    dayKey: requireDay(body.dayKey),
  };
  await prisma.$transaction(async (tx) => {
    if ((await tx.financeAccount.count({ where: { ...owner, id: { in: ids } } })) !== ids.length)
      throw new ApiError(404, "Conta não encontrada neste espaço.");
    if (id) found((await tx.financeEntry.updateMany({ where, data })).count);
    else await tx.financeEntry.create({ data });
  });
}
