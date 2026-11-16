"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, FileUp, LoaderCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { DateField } from "@/components/ui/DateField";
import { http } from "@/lib/client";
import { money, parseMoney, spaceNames, type FinanceSpace } from "@/lib/finance-format";
import { DOCUMENT_LIMIT, DOCUMENT_TYPES } from "@/lib/document-types";
import type { StatementPreview, ReviewedRow } from "@/lib/statement-types";
import { validDay } from "@/lib/organizer-input";

type Line = ReviewedRow & { selected: boolean; match: "imported" | "possible" | null };
type Account = { id: string; name: string };
const pageSize = 8;
function fileType(f: File) {
  const ext = f.name.toLowerCase().split(".").pop();
  if (ext === "csv") return "text/csv";
  if (ext === "ofx") return "application/x-ofx";
  if (DOCUMENT_TYPES.includes(f.type)) return f.type;
  return (
    (
      {
        pdf: "application/pdf",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
      } as Record<string, string>
    )[ext ?? ""] ?? ""
  );
}
export function StatementImport({
  accounts,
  space,
  month,
  onClose,
  onSaved,
}: {
  accounts: Account[];
  space: FinanceSpace;
  month: string;
  onClose: () => void;
  onSaved: (count: number, skipped: number, month: string | null) => void;
}) {
  const [chosenId, setAccountId] = useState(""),
    [accountName, setAccountName] = useState("");
  const [file, setFile] = useState<File | null>(null),
    [lines, setLines] = useState<Line[] | null>(null);
  const [busy, setBusy] = useState(false),
    [warning, setWarning] = useState(""),
    [error, setError] = useState(""),
    [page, setPage] = useState(0);
  const accountId = chosenId || accounts[0]?.id || "";
  const url = "/api/financeiro/" + space + "/importar";
  function pick(f: File) {
    setError("");
    setFile(null);
    if (!fileType(f)) return setError("Escolha um print JPG, PNG ou WebP, ou um extrato PDF, OFX ou CSV.");
    if (!f.size || f.size > DOCUMENT_LIMIT)
      return setError("Escolha um arquivo de até 8 MB que contenha movimentações.");
    setFile(f);
  }
  useEffect(() => {
    if (lines || busy) return;
    const paste = (e: ClipboardEvent) => {
      const img = Array.from(e.clipboardData?.items ?? [])
        .find((i) => i.kind === "file" && i.type.startsWith("image/"))
        ?.getAsFile();
      if (img) {
        e.preventDefault();
        pick(img);
      }
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [lines, busy]);
  function edit(source: string, changes: Partial<Line>) {
    setLines((prev) => prev?.map((r) => (r.source === source ? { ...r, ...changes } : r)) ?? null);
  }
  const selected = lines?.filter((r) => r.selected) ?? [];
  function total(kind: Line["kind"]) {
    return selected.reduce(
      (a, r) => a + (r.kind === kind && !r.peerId && r.settled ? (parseMoney(r.amount) ?? 0) : 0),
      0,
    );
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (lines) {
      const bad = lines.findIndex(
        (r) =>
          r.selected &&
          (!validDay(r.dayKey) ||
            !r.title.trim() ||
            !parseMoney(r.amount) ||
            !r.kind ||
            (!r.peerId && !r.category.trim())),
      );
      if (bad >= 0) {
        setPage(Math.floor(bad / pageSize));
        setError("Confira a data, a descrição, o tipo, a categoria e o valor do item " + (bad + 1) + ".");
        return;
      }
    }
    setBusy(true);
    try {
      if (!lines) {
        if (!file) throw Error("Escolha o arquivo.");
        const query = new URLSearchParams({ mes: month });
        if (accountId) query.set("conta", accountId);
        const response = await fetch(url + "?" + query, {
          method: "POST",
          headers: { "Content-Type": fileType(file) },
          body: file,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data?.rows))
          throw Error(data?.error ?? "Falha ao ler o arquivo. Tente novamente.");
        const preview = data as StatementPreview;
        setLines(preview.rows.map((r) => ({ ...r, selected: !r.match, peerId: "", includeMatch: false })));
        setWarning(preview.warning);
        setPage(0);
      } else {
        const result = await http.put<{ added: number; skipped: number; month: string | null }>(url, {
          accountId,
          accountName,
          rows: lines,
        });
        onSaved(result.added, result.skipped, result.month);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível importar.");
    } finally {
      setBusy(false);
    }
  }
  const pages = Math.ceil((lines?.length ?? 0) / pageSize);
  return (
    <Modal
      open
      wide={!!lines}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={
        <h2 className="text-lg font-semibold">
          {lines ? "Revisar movimentações" : "Importar extrato ou print"}
        </h2>
      }
    >
      <form noValidate={!!lines} onSubmit={submit} className="space-y-4 text-sm">
        {!lines ? (
          <>
            <label className="block">
              Conta · {spaceNames[space]}
              {accounts.length ? (
                <select
                  className="input mt-1"
                  disabled={busy}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input mt-1"
                  disabled={busy}
                  required
                  maxLength={60}
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Nome da primeira conta"
                />
              )}
            </label>
            {!accounts.length && (
              <p className="text-xs text-ink-2">
                Ao confirmar, a conta será criada com saldo inicial de R$ 0,00. Você pode ajustar o saldo
                anterior em Contas.
              </p>
            )}
            <label className="block">
              Arquivo
              <input
                type="file"
                className="input mt-1 w-full min-w-0"
                accept=".pdf,.ofx,.csv,image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pick(f);
                }}
              />
            </label>
            <p className="text-xs text-ink-2">
              Escolha um arquivo de até 8 MB ou cole um print aqui. A OpenAI lê imagens e PDFs. O aplicativo
              lê CSV e OFX diretamente.
            </p>
            {file && <p className="break-all text-ink-2">{file.name}</p>}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="break-all text-ink-2">
                {spaceNames[space]} · {accounts.find((a) => a.id === accountId)?.name ?? accountName} ·{" "}
                {file?.name}
              </p>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  setLines(null);
                  setError("");
                  setWarning("");
                }}
              >
                Trocar arquivo ou conta
              </button>
            </div>
            {warning && (
              <p role="status" className="text-orange">
                {warning}
              </p>
            )}
            <p>
              {selected.length} de {lines.length} selecionadas · Receitas {money(total("income"))} · Despesas{" "}
              {money(total("expense"))}
            </p>
            {lines.some((r) => r.match) && (
              <p className="text-xs text-ink-2">
                Lançamentos já importados e possíveis duplicatas vêm desmarcados. Marque uma possível
                duplicata se for uma operação diferente.
              </p>
            )}
            <div className="space-y-3">
              {lines.slice(page * pageSize, (page + 1) * pageSize).map((r, i) => {
                const n = page * pageSize + i + 1;
                return (
                  <section key={r.source} className="space-y-2 rounded-xl border border-line p-3">
                    <label className="flex items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        aria-label={"Incluir item " + n}
                        checked={r.selected}
                        disabled={busy || r.match === "imported"}
                        onChange={(e) =>
                          edit(r.source, {
                            selected: e.target.checked,
                            includeMatch: r.match === "possible" && e.target.checked,
                          })
                        }
                      />
                      <span className="min-w-0 break-words">{r.title || "Movimentação " + n}</span>
                      {r.match && (
                        <span className="shrink-0 text-xs text-ink-2">
                          {r.match === "imported" ? "Já importada" : "Possível duplicata"}
                        </span>
                      )}
                    </label>
                    {!r.selected && (
                      <p className="text-xs text-ink-2">
                        {r.dayKey.split("-").reverse().join("/")} ·{" "}
                        {r.kind === "expense" ? "Saída" : r.kind === "income" ? "Entrada" : "Tipo indefinido"}{" "}
                        · R$ {r.amount || "?"}
                      </p>
                    )}
                    {r.selected && (
                      <fieldset className="grid min-w-0 gap-2 sm:grid-cols-3" disabled={busy}>
                        <label className="sm:col-span-2">
                          Descrição
                          <input
                            aria-label={"Descrição do item " + n}
                            className="input"
                            maxLength={160}
                            value={r.title}
                            onChange={(e) => edit(r.source, { title: e.target.value })}
                          />
                        </label>
                        <div>
                          Data
                          <DateField
                            value={r.dayKey}
                            onChange={(dayKey) => edit(r.source, { dayKey })}
                            ariaLabel={"Data do item " + n}
                          />
                        </div>
                        <label>
                          Tipo
                          <select
                            className="input"
                            aria-label={"Tipo do item " + n}
                            value={r.kind}
                            onChange={(e) => edit(r.source, { kind: e.target.value as Line["kind"] })}
                          >
                            <option value="">Escolha</option>
                            <option value="income">Entrada</option>
                            <option value="expense">Saída</option>
                          </select>
                        </label>
                        <label>
                          Valor (R$)
                          <input
                            className="input"
                            aria-label={"Valor do item " + n}
                            inputMode="decimal"
                            value={r.amount}
                            onChange={(e) => edit(r.source, { amount: e.target.value })}
                          />
                        </label>
                        {!r.peerId && (
                          <label>
                            Categoria
                            <input
                              className="input"
                              maxLength={60}
                              aria-label={"Categoria do item " + n}
                              value={r.category}
                              onChange={(e) => edit(r.source, { category: e.target.value })}
                            />
                          </label>
                        )}
                        {accounts.length > 1 && (
                          <label className="sm:col-span-2">
                            Transferência entre minhas contas
                            <select
                              aria-label={"Transferência do item " + n}
                              className="input"
                              value={r.peerId}
                              onChange={(e) => edit(r.source, { peerId: e.target.value })}
                            >
                              <option value="">Não é transferência interna</option>
                              {accounts
                                .filter((a) => a.id !== accountId)
                                .map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={r.settled}
                            onChange={(e) => edit(r.source, { settled: e.target.checked })}
                          />{" "}
                          Já realizado
                        </label>
                      </fieldset>
                    )}
                  </section>
                );
              })}
            </div>
            {pages > 1 && (
              <nav aria-label="Páginas de movimentações" className="flex items-center justify-between">
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={!page}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={16} />
                  Anterior
                </button>
                <span>
                  {page + 1} / {pages}
                </span>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={page === pages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                  <ChevronRight size={16} />
                </button>
              </nav>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-red">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            disabled={busy || (lines ? !selected.length : !file || (!accountId && !accountName.trim()))}
          >
            {busy ? <LoaderCircle size={15} className="motion-safe:animate-spin" /> : <FileUp size={15} />}
            {lines
              ? busy
                ? "Contabilizando…"
                : "Contabilizar selecionadas"
              : busy
                ? "Lendo arquivo…"
                : "Ler arquivo"}
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            Fechar
          </button>
        </div>
      </form>
    </Modal>
  );
}
