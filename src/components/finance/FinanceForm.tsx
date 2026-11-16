"use client";

import { useState, type FormEvent } from "react";
import { DateField } from "@/components/ui/DateField";
import { Modal } from "@/components/ui/Modal";
import { http } from "@/lib/client";
import type { FinanceOverview } from "@/lib/finance";
import {
  categoryLabel,
  decimal,
  kindNames,
  spaceNames,
  suggestions,
  type EntryKind,
  type FinanceSpace,
} from "@/lib/finance-format";

export type FinanceFormState =
  | { type: "contas"; item?: FinanceOverview["accounts"][number] }
  | { type: "limites"; item?: FinanceOverview["budgets"][number] }
  | { type: "lancamentos"; item?: FinanceOverview["entries"][number] };

export function FinanceForm({
  form,
  space,
  month,
  today,
  initialDay,
  overview,
  onClose,
  onSaved,
}: {
  form: FinanceFormState;
  space: FinanceSpace;
  month: string;
  today: string;
  initialDay: string;
  overview: FinanceOverview;
  onClose: () => void;
  onSaved: () => void;
}) {
  const entry = form.type === "lancamentos" ? form.item : undefined;
  const [kind, setKind] = useState<EntryKind>((entry?.kind ?? "expense") as EntryKind);
  const [source, setSource] = useState(entry?.accountId ?? overview.accounts[0]?.id ?? "");
  const [day, setDay] = useState(entry?.dayKey ?? initialDay);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const fields = new FormData(event.currentTarget);
    const body = {
      ...Object.fromEntries(fields),
      id: form.item?.id,
      month,
      dayKey: day,
      kind,
      settled: fields.has("settled"),
    };
    try {
      const url = "/api/financeiro/" + space + "/" + form.type;
      if (form.item && form.type !== "limites") await http.patch(url, body);
      else await http.post(url, body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  const title =
    form.type === "contas"
      ? form.item
        ? "Editar conta"
        : "Nova conta"
      : form.type === "limites"
        ? "Limite mensal"
        : entry
          ? "Editar lançamento"
          : "Novo lançamento";
  const categories = new Set([
    ...suggestions[space][kind === "income" ? "income" : "expense"],
    ...overview.entries.filter((e) => e.kind === kind).map((e) => categoryLabel(e.category)),
    ...overview.budgets.map((b) => categoryLabel(b.category)),
  ]);
  return (
    <Modal
      open
      onClose={onClose}
      title={
        <>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-ink-2">{spaceNames[space]}</p>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4 text-sm">
        {form.type === "contas" ? (
          <>
            <label className="block">
              Nome da conta
              <input
                className="input mt-1"
                name="name"
                required
                maxLength={60}
                defaultValue={form.item?.name}
                placeholder="Ex.: Conta corrente"
              />
            </label>
            <label className="block">
              Saldo inicial (R$)
              <input
                className="input mt-1"
                name="opening"
                required
                inputMode="decimal"
                defaultValue={decimal(form.item?.openingCents ?? 0)}
              />
            </label>
          </>
        ) : (
          <>
            {form.type === "lancamentos" && (
              <>
                <label className="block">
                  Tipo
                  <select
                    className="input mt-1"
                    name="kind"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as EntryKind)}
                  >
                    {Object.entries(kindNames).map(([value, label]) => (
                      <option
                        key={value}
                        value={value}
                        disabled={value === "transfer" && overview.accounts.length < 2}
                      >
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Descrição
                  <input
                    name="title"
                    required
                    maxLength={160}
                    defaultValue={entry?.title}
                    className="input mt-1"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    Conta de origem
                    <select
                      className="input mt-1"
                      name="accountId"
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                    >
                      {overview.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {kind === "transfer" && (
                    <label>
                      Conta de destino
                      <select
                        key={source}
                        className="input mt-1"
                        name="destinationId"
                        required
                        defaultValue={entry?.destinationId ?? ""}
                      >
                        <option value="">Escolher conta</option>
                        {overview.accounts
                          .filter((a) => a.id !== source)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </div>
              </>
            )}
            {(form.type === "limites" || kind !== "transfer") && (
              <label className="block">
                Categoria
                <input
                  className="input mt-1"
                  list="finance-categories"
                  key={kind}
                  name="category"
                  required
                  maxLength={60}
                  readOnly={form.type === "limites" && !!form.item}
                  defaultValue={form.item && "category" in form.item ? categoryLabel(form.item.category) : ""}
                  placeholder="Escolha ou escreva uma categoria"
                />
                <datalist id="finance-categories">
                  {[...categories].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                Valor (R$)
                <input
                  className="input mt-1"
                  name="amount"
                  required
                  inputMode="decimal"
                  placeholder="0,00"
                  defaultValue={form.item ? decimal(form.item.cents) : ""}
                />
              </label>
              {form.type === "lancamentos" && (
                <div>
                  Data
                  <DateField className="mt-1" value={day} onChange={setDay} ariaLabel="Data do lançamento" />
                </div>
              )}
            </div>
            {form.type === "lancamentos" && (
              <label className="flex items-center gap-2">
                <input type="checkbox" name="settled" defaultChecked={entry?.settled ?? day <= today} /> Já
                realizado
              </label>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-red">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </form>
    </Modal>
  );
}
