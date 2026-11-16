"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeftRight,
  Building2,
  FileUp,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { addMonths, format } from "date-fns";
import { http } from "@/lib/client";
import { askConfirm, notify } from "@/components/ui/ConfirmProvider";
import { keyToDate } from "@/lib/time";
import type { FinanceOverview } from "@/lib/finance";
import { categoryLabel, kindNames, money, spaceNames, type FinanceSpace } from "@/lib/finance-format";
import { StatementImport } from "./StatementImport";
import { FinanceForm, type FinanceFormState } from "./FinanceForm";

export function FinancePage({
  space,
  month,
  today,
  overview,
}: {
  space: FinanceSpace;
  month: string;
  today: string;
  overview: FinanceOverview;
}) {
  const { accounts, entries, budgets } = overview;
  const router = useRouter();
  const [form, setForm] = useState<FinanceFormState | null>(null);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const date = keyToDate(month + "-01");
  const monthLabel = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const url = (s: FinanceSpace, m: string) =>
    "/financeiro?espaco=" + (s === "business" ? "empresa" : "pessoal") + "&mes=" + m;
  const settled = entries.filter((e) => e.settled);
  const sum = (kind: string) => settled.filter((e) => e.kind === kind).reduce((t, e) => t + e.cents, 0);
  const spent = new Map<string, number>();
  for (const e of settled)
    if (e.kind === "expense") spent.set(e.category, (spent.get(e.category) ?? 0) + e.cents);
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const visible = entries.filter(
    (e) =>
      (filter === "all" || (filter === "pending" ? !e.settled : e.kind === filter)) &&
      [e.title, e.category, names.get(e.accountId), names.get(e.destinationId ?? "")]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(search.trim().toLocaleLowerCase("pt-BR")),
  );
  const expenses = [...spent].sort((a, b) => b[1] - a[1]);
  async function remove(resource: string, id: string, title: string) {
    if (
      !(await askConfirm({
        title: "Excluir registro",
        message: "Excluir “" + title + "” deste espaço?",
        confirmLabel: "Excluir",
        danger: true,
      }))
    )
      return;
    try {
      await http.del("/api/financeiro/" + space + "/" + resource, { id });
      router.refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Falha ao excluir.", "error");
    }
  }
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <Wallet size={23} className="text-orange" />
            Financeiro
          </h1>
          <p className="text-sm text-ink-2">Organização financeira</p>
        </div>
        <nav className="flex rounded-full border border-line bg-fill p-1" aria-label="Espaço financeiro">
          {(["personal", "business"] as const).map((s) => {
            const Icon = s === "personal" ? CircleUserRound : Building2;
            return (
              <Link
                key={s}
                href={url(s, month)}
                aria-current={space === s ? "page" : undefined}
                className={
                  "flex items-center gap-2 rounded-full px-4 py-2 text-sm " +
                  (s === space ? "bg-fill-3 text-ink" : "text-ink-2")
                }
              >
                <Icon size={15} />
                {spaceNames[s]}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            aria-label="Mês anterior"
            className="btn btn-ghost"
            href={url(space, format(addMonths(date, -1), "yyyy-MM"))}
          >
            <ChevronLeft size={16} />
          </Link>
          <h2 className="text-sm font-semibold capitalize">{monthLabel}</h2>
          <Link
            aria-label="Próximo mês"
            className="btn btn-ghost"
            href={url(space, format(addMonths(date, 1), "yyyy-MM"))}
          >
            <ChevronRight size={16} />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => setImporting(true)}>
            <FileUp size={16} />
            Importar extrato ou print
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setForm({ type: accounts.length ? "lancamentos" : "contas" })}
          >
            <Plus size={16} />
            {accounts.length ? "Novo lançamento" : "Adicionar primeira conta"}
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Saldo até o fim do mês", accounts.reduce((t, a) => t + a.balance, 0), "text-ink"],
          ["Receitas recebidas", sum("income"), "text-green"],
          ["Despesas pagas", sum("expense"), "text-red"],
        ].map(([label, val, style]) => (
          <div key={label} className="card p-5">
            <p className="text-sm text-ink-2">{label}</p>
            <strong className={`mt-2 block text-2xl tracking-tight tabular-nums ${style}`}>
              {money(Number(val))}
            </strong>
          </div>
        ))}
      </div>
      <section className="card space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Lançamentos</h2>
          <div className="flex max-w-full flex-wrap gap-2">
            <input
              aria-label="Buscar lançamentos"
              className="input min-w-0 sm:max-w-52"
              type="search"
              value={search}
              placeholder="Buscar lançamento"
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Filtrar lançamentos"
              className="input sm:max-w-40"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="pending">Pendentes</option>
              {Object.entries(kindNames).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!visible.length && (
          <p className="py-3 text-sm text-ink-2">
            {entries.length ? "Nenhum lançamento corresponde ao filtro." : "Nenhum lançamento neste mês."}
          </p>
        )}
        <ul className="divide-y divide-line">
          {visible.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-32 flex-1">
                <strong className="block break-words text-sm">{e.title}</strong>
                <p className="text-xs text-ink-2">
                  {e.dayKey.slice(8)}/{e.dayKey.slice(5, 7)} · {names.get(e.accountId)}{" "}
                  {e.destinationId ? "→ " + names.get(e.destinationId) : "· " + categoryLabel(e.category)} ·{" "}
                  {e.settled ? "Realizado" : "Pendente"}
                </p>
              </div>
              <span
                className={`flex items-center gap-1 text-sm font-semibold tabular-nums ${e.kind === "expense" ? "text-red" : e.kind === "income" ? "text-green" : "text-ink-2"}`}
              >
                {e.kind === "transfer" ? <ArrowLeftRight size={14} /> : e.kind === "expense" ? "−" : "+"}
                {money(e.cents)}
              </span>
              <div className="flex gap-1">
                <button
                  className="btn btn-ghost"
                  aria-label={"Editar " + e.title}
                  onClick={() => setForm({ type: "lancamentos", item: e })}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="btn btn-ghost"
                  aria-label={"Excluir " + e.title}
                  onClick={() => void remove("lancamentos", e.id, e.title)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Contas</h2>
            <button className="btn btn-ghost" onClick={() => setForm({ type: "contas" })}>
              <Plus size={14} /> Nova conta
            </button>
          </div>
          {!accounts.length && (
            <p className="text-sm text-ink-2">Cadastre uma conta e informe o saldo inicial.</p>
          )}
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-2 border-t border-line pt-3 text-sm">
              <span className="min-w-0 flex-1 break-words">{a.name}</span>
              <strong>{money(a.balance)}</strong>
              <button
                className="btn btn-ghost"
                aria-label={"Editar " + a.name}
                onClick={() => setForm({ type: "contas", item: a })}
              >
                <Pencil size={14} />
              </button>
            </div>
          ))}
        </section>
        <section className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Limites do mês</h2>
            <button className="btn btn-ghost" onClick={() => setForm({ type: "limites" })}>
              <Plus size={14} /> Definir limite
            </button>
          </div>
          {!budgets.length && (
            <p className="text-sm text-ink-2">Defina quanto pretende gastar por categoria.</p>
          )}
          {budgets.map((b) => {
            const used = spent.get(b.category) ?? 0;
            return (
              <div key={b.id}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">{categoryLabel(b.category)}</p>
                    <p className="text-xs text-ink-2">
                      {money(used)} de {money(b.cents)}
                      {used > b.cents ? " · acima do limite" : ""}
                    </p>
                  </div>
                  <button
                    className="btn btn-ghost"
                    aria-label={"Editar limite de " + b.category}
                    onClick={() => setForm({ type: "limites", item: b })}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn btn-ghost"
                    aria-label={"Excluir limite de " + b.category}
                    onClick={() => void remove("limites", b.id, b.category)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-fill-2">
                  <div
                    className={"h-full rounded-full " + (used > b.cents ? "bg-red" : "bg-orange")}
                    style={{ width: Math.min(100, (used / b.cents) * 100) + "%" }}
                  />
                </div>
              </div>
            );
          })}
        </section>
      </div>
      {expenses.length > 0 && (
        <section className="card space-y-3 p-5">
          <h2 className="font-semibold">Despesas por categoria</h2>
          {expenses.map(([category, total]) => (
            <div key={category} className="flex justify-between gap-3 border-t border-line pt-2 text-sm">
              <span>{categoryLabel(category)}</span>
              <span>{money(total)}</span>
            </div>
          ))}
        </section>
      )}
      {importing && (
        <StatementImport
          accounts={accounts}
          space={space}
          month={month}
          onClose={() => setImporting(false)}
          onSaved={(count, skipped, latest) => {
            setImporting(false);
            const saved =
              count === 1 ? "1 movimentação contabilizada." : count + " movimentações contabilizadas.";
            notify(saved + (skipped ? " Já registradas: " + skipped + "." : ""));
            if (latest && latest !== month) router.push(url(space, latest));
            router.refresh();
          }}
        />
      )}
      {form && (
        <FinanceForm
          form={form}
          overview={overview}
          space={space}
          month={month}
          today={today}
          initialDay={today.slice(0, 7) === month ? today : month + "-01"}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
