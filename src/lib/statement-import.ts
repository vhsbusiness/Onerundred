import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { parseMoney, validMonth, type FinanceSpace } from "./finance-format";
import { requireDay, shortText } from "./organizer-input";
import { readUpload } from "./document-upload";
import { hash, identifyRows, normalize, parseCsv, parseOfx } from "./statement-parse";
import { DOCUMENT_TYPES } from "./document-types";
import { STATEMENT_LIMIT, type StatementRow, type StatementPreview } from "./statement-types";
import { readStatementImage } from "./statement-vision";

type Draft = StatementRow & { peerId?: string; selected?: boolean; includeMatch?: boolean };
const rowId = (accountId: string, source: string) => "fi_" + hash(accountId + "|" + source);
const missingAccount = () => new ApiError(404, "Conta não encontrada neste espaço financeiro.");

async function matchRows(
  db: Prisma.TransactionClient,
  userId: string,
  space: FinanceSpace,
  accountId: string,
  rows: Draft[],
) {
  const ids = rows.map((r) => rowId(accountId, r.source));
  const dates = [...new Set(rows.map((r) => r.dayKey).filter(Boolean))];
  const existing = await db.financeEntry.findMany({
    where: {
      OR: [
        { account: { userId, space }, id: { in: ids } },
        { accountId, dayKey: { in: dates } },
        { destinationId: accountId, dayKey: { in: dates } },
      ],
    },
    select: {
      id: true,
      accountId: true,
      destinationId: true,
      dayKey: true,
      cents: true,
      kind: true,
      title: true,
    },
  });
  const present = new Set(existing.map((e) => e.id));
  const reserved = new Set(ids);
  const remaining = existing.filter((e) => !reserved.has(e.id));
  return rows.map((r, i) => {
    if (present.has(ids[i])) return "imported" as const;
    const cents = parseMoney(r.amount);
    const match = remaining.findIndex((e) => {
      if (e.dayKey !== r.dayKey || e.cents !== cents) return false;
      if (e.kind === "transfer") {
        const incoming = e.destinationId === accountId;
        return (
          r.kind === (incoming ? "income" : "expense") &&
          (!r.peerId || r.peerId === (incoming ? e.accountId : e.destinationId))
        );
      }
      return e.kind === r.kind && normalize(e.title) === normalize(r.title);
    });
    if (match < 0) return null;
    remaining.splice(match, 1);
    return "possible" as const;
  });
}

export async function previewStatement(
  userId: string,
  space: FinanceSpace,
  req: Request,
): Promise<StatementPreview> {
  const url = new URL(req.url),
    accountId = url.searchParams.get("conta"),
    month = url.searchParams.get("mes");
  if (!validMonth(month)) throw new ApiError(400, "Escolha um mês válido.");
  if (accountId && !(await prisma.financeAccount.count({ where: { id: accountId, userId, space } })))
    throw missingAccount();
  const type = req.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
  if (!DOCUMENT_TYPES.includes(type) && type !== "text/csv" && type !== "application/x-ofx")
    throw new ApiError(415, "Escolha um print, PDF, CSV ou OFX.");
  const bytes = await readUpload(req);
  const result =
    type === "application/x-ofx"
      ? { rows: parseOfx(bytes), warning: "" }
      : type === "text/csv"
        ? { rows: parseCsv(bytes), warning: "" }
        : await readStatementImage(userId, bytes, type, month);
  const rows = identifyRows(result.rows, bytes);
  const matches = accountId ? await matchRows(prisma, userId, space, accountId, rows) : [];
  return { rows: rows.map((r, i) => ({ ...r, match: matches[i] ?? null })), warning: result.warning };
}

function decodeRow(raw: unknown): Draft {
  if (!raw || typeof raw !== "object") throw new ApiError(400, "Movimentação inválida.");
  const r = raw as Record<string, unknown>;
  if (typeof r.source !== "string" || !/^[0-9a-f]{64}$/.test(r.source) || typeof r.selected !== "boolean")
    throw new ApiError(400, "Identificação da movimentação inválida.");
  if (r.selected) {
    requireDay(r.dayKey);
    shortText(r.title, "descrição", 160);
    if (!r.peerId) shortText(r.category, "categoria", 60);
    if (
      !parseMoney(r.amount) ||
      !["income", "expense"].includes(String(r.kind)) ||
      typeof r.settled !== "boolean"
    )
      throw new ApiError(400, "Confira o valor, o tipo e a situação das movimentações selecionadas.");
  }
  return {
    source: r.source,
    dayKey: typeof r.dayKey === "string" ? r.dayKey : "",
    title: typeof r.title === "string" ? r.title.trim() : "",
    amount: typeof r.amount === "string" ? r.amount : "",
    kind: r.kind === "expense" || r.kind === "income" ? r.kind : "",
    category: typeof r.category === "string" ? r.category.trim().toLocaleLowerCase("pt-BR") : "",
    settled: r.settled === true,
    peerId: r.peerId ? shortText(r.peerId, "conta da transferência") : undefined,
    selected: r.selected,
    includeMatch: r.includeMatch === true,
  };
}
export async function confirmStatement(userId: string, space: FinanceSpace, body: Record<string, unknown>) {
  if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > STATEMENT_LIMIT)
    throw new ApiError(400, "Quantidade de movimentações inválida.");
  const rows = body.rows.map(decodeRow);
  if (new Set(rows.map((r) => r.source)).size !== rows.length)
    throw new ApiError(400, "O arquivo contém identificadores de movimentação repetidos.");
  if (!rows.some((r) => r.selected)) throw new ApiError(400, "Selecione pelo menos uma movimentação.");
  const requestedId = body.accountId ? shortText(body.accountId, "conta") : undefined;
  const name = requestedId ? undefined : shortText(body.accountName, "nome da conta", 60);
  return prisma.$transaction(async (tx) => {
    let accountId = requestedId;
    if (!accountId) {
      const account = await tx.financeAccount.upsert({
        where: { userId_space_name: { userId, space, name: name! } },
        update: { name: name! },
        create: { userId, space, name: name!, openingCents: 0 },
      });
      accountId = account.id;
    }
    const peers = rows.flatMap((r) => (r.selected && r.peerId ? [r.peerId] : []));
    if (peers.includes(accountId)) throw new ApiError(400, "Escolha outra conta para a transferência.");
    // Serialize retries and opposite-side imports in the same account order.
    for (const id of [...new Set([accountId, ...peers])].sort()) {
      if (
        !(
          await tx.financeAccount.updateMany({
            where: { id, userId, space },
            data: { openingCents: { increment: 0 } },
          })
        ).count
      )
        throw missingAccount();
    }
    const matches = await matchRows(tx, userId, space, accountId, rows);
    const entries: Prisma.FinanceEntryCreateManyInput[] = [];
    let skipped = 0;
    for (const [i, r] of rows.entries()) {
      if (!r.selected) continue;
      if (matches[i] === "imported" || (matches[i] === "possible" && !r.includeMatch)) {
        skipped++;
        continue;
      }
      const incomingTransfer = r.peerId && r.kind === "income";
      const origin = incomingTransfer ? r.peerId! : accountId;
      entries.push({
        id: rowId(accountId, r.source),
        accountId: origin,
        destinationId: incomingTransfer ? accountId : (r.peerId ?? null),
        kind: r.peerId ? "transfer" : r.kind,
        cents: parseMoney(r.amount)!,
        title: r.title,
        dayKey: r.dayKey,
        category: r.peerId ? "" : r.category,
        settled: r.settled,
      });
    }
    if (entries.length) await tx.financeEntry.createMany({ data: entries });
    return {
      added: entries.length,
      skipped,
      month:
        entries
          .map((e) => e.dayKey)
          .sort()
          .at(-1)
          ?.slice(0, 7) ?? null,
    };
  });
}
