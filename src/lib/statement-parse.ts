import { createHash } from "node:crypto";
import { ApiError } from "./errors";
import { validDay } from "./organizer-input";
import { decimal, parseMoney } from "./finance-format";
import { STATEMENT_LIMIT, type StatementRow } from "./statement-types";

export type Extracted = Omit<StatementRow, "source"> & { bankId?: string };
export const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export function identifyRows(rows: Extracted[], bytes: Buffer): StatementRow[] {
  if (!rows.length)
    throw new ApiError(
      422,
      "Nenhuma movimentação identificada. Confira se o extrato contém lançamentos legíveis.",
    );
  if (rows.length > STATEMENT_LIMIT)
    throw new ApiError(413, "Divida o extrato em arquivos de até " + STATEMENT_LIMIT + " movimentações.");
  const file = hash(bytes),
    ids = new Set<string>();
  return rows.map(({ bankId, ...row }, index) => {
    // Preserve identity if OCR wording, categories or the user's edits change on a retry.
    const source = hash(bankId ? "ofx:" + bankId : file + ":" + index);
    if (ids.has(source))
      throw new ApiError(
        422,
        "O OFX repete o identificador de uma operação. Exporte um CSV ou PDF para conferir os lançamentos.",
      );
    ids.add(source);
    return { ...row, source };
  });
}

function decoded(bytes: Buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
function row(dayKey: string, title: string, value: string, bankId?: string): Extracted {
  const cents = parseMoney(
    value
      .trim()
      .replace(/^R\$\s*/, "")
      .replace(/^\+/, ""),
    true,
  );
  return {
    dayKey: validDay(dayKey) ? dayKey : "",
    title: title.trim().slice(0, 160),
    amount: cents ? decimal(Math.abs(cents)) : "",
    kind: cents === null || cents === 0 ? "" : cents < 0 ? "expense" : "income",
    category: "Outros",
    settled: true,
    bankId,
  };
}
export function parseOfx(bytes: Buffer): Extracted[] {
  const text = decoded(bytes);
  if (!/<OFX>/i.test(text)) throw new ApiError(422, "Arquivo OFX inválido.");
  if ((text.match(/<BANKTRANLIST>/gi) ?? []).length > 1)
    throw new ApiError(422, "Envie um extrato de uma conta por vez.");
  const currency = /<CURDEF>\s*([A-Z]{3})/i.exec(text)?.[1];
  if (currency && currency.toUpperCase() !== "BRL")
    throw new ApiError(422, "Escolha um extrato em reais (BRL).");
  return [...text.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi)].map((m) => {
    const field = (key: string) =>
      (new RegExp("<" + key + ">\\s*([^<\\r\\n]*)", "i").exec(m[1])?.[1] ?? "")
        .trim()
        .replace(/&amp;/gi, "&");
    const date = field("DTPOSTED");
    return row(
      [date.slice(0, 4), date.slice(4, 6), date.slice(6, 8)].join("-"),
      field("MEMO") || field("NAME"),
      field("TRNAMT"),
      field("FITID") || undefined,
    );
  });
}

function csvRecords(text: string, sep: string) {
  const rows: string[][] = [];
  let record: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === sep && !quoted) {
      record.push(field);
      field = "";
    } else if (c === "\n" && !quoted) {
      record.push(field);
      rows.push(record);
      record = [];
      field = "";
    } else field += c;
    if (rows.length > STATEMENT_LIMIT + 2)
      throw new ApiError(413, "Divida o CSV em arquivos de até " + STATEMENT_LIMIT + " movimentações.");
  }
  if (quoted) throw new ApiError(422, "Aspas incompletas no CSV.");
  record.push(field);
  rows.push(record);
  return rows.filter((r) => r.some((v) => v.trim()));
}
export function parseCsv(bytes: Buffer): Extracted[] {
  const text = decoded(bytes).replace(/\r\n?/g, "\n").trim();
  const header = text.split("\n", 1)[0];
  const sep = header.includes(";") ? ";" : header.includes("\t") ? "\t" : ",";
  const [first = [], ...records] = csvRecords(text, sep),
    columns = first.map(normalize);
  const index = (names: string[]) => columns.findIndex((c) => names.includes(c));
  const date = index(["data", "date", "data lancamento", "data do lancamento"]);
  const title = index(["descricao", "description", "historico", "titulo", "lancamento", "memo", "title"]);
  const value = index(["valor", "amount", "valor r", "valor do lancamento"]);
  const credit = index(["credito", "entrada", "credit"]),
    debit = index(["debito", "saida", "debit"]);
  const type = index(["tipo", "tipo de lancamento", "tipo de movimentacao", "type"]);
  const status = index(["situacao", "status", "estado"]);
  const currency = index(["moeda", "currency"]);
  if (
    currency >= 0 &&
    records.some(
      (r) =>
        r[currency]?.trim() && !["brl", "r$", "real", "reais"].includes(r[currency].trim().toLowerCase()),
    )
  ) {
    throw new ApiError(422, "Escolha um extrato em reais (BRL).");
  }
  if (date < 0 || title < 0 || (value < 0 && credit < 0 && debit < 0))
    throw new ApiError(
      422,
      "O CSV precisa de data, descrição e valor com sinal, ou colunas de crédito e débito.",
    );
  return records
    .filter(
      (r) =>
        !/^(saldo(?: (?:anterior|inicial|final|do dia|disponivel|atual)\b.*)?|tota(?:l|is)(?: (?:de )?(?:creditos|debitos|entradas|saidas|do dia))?)$/.test(
          normalize(r[title] ?? ""),
        ),
    )
    .map((r) => {
      const raw = (r[date] ?? "").trim(),
        br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
      const out = row(br ? [br[3], br[2], br[1]].join("-") : raw, r[title] ?? "", r[value] ?? "");
      if (
        status >= 0 &&
        /^(pendente|previst[oa]|agendad[oa]|em processamento|pending|scheduled)$/.test(
          normalize(r[status] ?? ""),
        )
      )
        out.settled = false;
      if (value < 0) {
        const incoming = parseMoney((r[credit] ?? "").trim(), true),
          outgoing = parseMoney((r[debit] ?? "").trim(), true);
        const amount =
          incoming && !outgoing ? Math.abs(incoming) : outgoing && !incoming ? -Math.abs(outgoing) : 0;
        if (amount) {
          out.kind = amount < 0 ? "expense" : "income";
          out.amount = decimal(Math.abs(amount));
        }
      } else if (type >= 0) {
        const sign = normalize(r[type] ?? "");
        if (["debito", "debit", "saida", "despesa", "d"].includes(sign)) out.kind = "expense";
        if (["credito", "credit", "entrada", "receita", "c"].includes(sign)) out.kind = "income";
      }
      return out;
    });
}
