"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, Check, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { DateField } from "@/components/ui/DateField";
import { TimeField } from "@/components/ui/TimeField";
import { askConfirm, notify } from "@/components/ui/ConfirmProvider";
import { http } from "@/lib/client";
import { decimal, money, parseMoney, spaceNames, type FinanceSpace } from "@/lib/finance-format";
import { frequencies, frequencyUnits, savingsEnd, savingsPlan, type SavingsFrequency } from "@/lib/savings-plan";
import type { SavingsGoalView } from "@/lib/savings";

const shortDay = (value: string) => value.split("-").reverse().join("/");
const periodLabel = (p: { start: string; end: string }) => p.start === p.end ? shortDay(p.start) : `${shortDay(p.start)} a ${shortDay(p.end)}`;

export function SavingsGoals({ goals, space, today }: { goals: SavingsGoalView[]; space: FinanceSpace; today: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [recording, setRecording] = useState<{ goal: SavingsGoalView; start: string } | null>(null);
  const refresh = () => { setCreating(false); setRecording(null); router.refresh(); };
  async function remove(goal: SavingsGoalView) {
    if (!await askConfirm({ title: "Excluir meta financeira?", message: `A meta “${goal.name}” e seus registros serão excluídos. Os saldos das contas permanecem iguais.`, confirmLabel: "Excluir", danger: true })) return;
    try { await http.del(`/api/financeiro/${space}/metas`, { id: goal.id }); router.refresh(); }
    catch (e) { notify(e instanceof Error ? e.message : "Não foi possível excluir.", "error"); }
  }
  return <section className="card space-y-4 p-4 sm:p-6" aria-label="Metas para guardar">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Target size={19} className="text-orange" /> Metas para guardar</h2><p className="mt-1 text-sm text-ink-2">Defina um prazo e acompanhe quanto conseguiu guardar.</p></div>
      <button className="btn" onClick={() => setCreating(true)}><Plus size={15} /> Nova meta</button>
    </div>
    {!goals.length && <p className="text-sm text-ink-3">Guarde um valor por dia, semana ou mês, ou defina o total que quer alcançar.</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      {goals.map(goal => {
        const current = goal.periods.find(p => p.start <= today && p.end >= today);
        const pending = goal.periods.filter(p => p.available && p.savedCents === null);
        const target = current ?? pending.at(-1);
        const done = goal.savedCents >= goal.totalCents;
        return <article id={`meta-${goal.id}`} key={goal.id} className="min-w-0 scroll-mt-6 rounded-2xl border border-line bg-fill p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><h3 className="break-words font-semibold">{goal.name}</h3><p className="text-xs text-ink-2">{frequencies[goal.frequency as SavingsFrequency]} · {goal.periods.length} períodos · {goal.days} dias</p></div>
            <button className="btn btn-ghost h-8 w-8 shrink-0 p-0" aria-label={`Excluir meta ${goal.name}`} onClick={() => void remove(goal)}><Trash2 size={14} /></button>
          </div>
          <p className="mt-3 text-xl font-semibold tabular-nums">{money(goal.savedCents)} <span className="text-sm font-normal text-ink-2">de {money(goal.totalCents)}</span></p>
          <div role="progressbar" aria-label={`Progresso de ${goal.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(goal.savedCents / goal.totalCents * 100))} className="my-2 h-2 overflow-hidden rounded-full bg-fill-3"><div className="h-full rounded-full bg-green transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.min(100, goal.savedCents / goal.totalCents * 100)}%` }} /></div>
          <p className="text-xs text-ink-2">{shortDay(goal.startDay)} → {shortDay(goal.endDay)}{done ? " · Meta alcançada" : today > goal.endDay ? " · Prazo encerrado" : today < goal.startDay ? " · Ainda não começou" : ""}</p>
          {current && <div className="mt-4 rounded-xl border border-line p-3 text-sm">
            <p className="text-xs text-ink-2">Período atual · {periodLabel(current)}</p>
            <p className="mt-1">Guardar <strong>{money(current.targetCents)}</strong></p>
            {current.savedCents !== null && <p className={current.savedCents >= current.targetCents ? "text-green" : "text-orange"}>{current.savedCents >= current.targetCents ? "Cumprida" : "Não cumprida"} · guardou {money(current.savedCents)}</p>}
          </div>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {target && <button className="btn btn-primary" onClick={() => setRecording({ goal, start: target.start })}>{target.savedCents !== null ? <Pencil size={14} /> : <Check size={14} />}{target.savedCents !== null ? "Editar registro" : "Registrar quanto guardei"}</button>}
            {pending.length > 0 && <span className="text-xs text-ink-2">{pending.length} período(s) sem registro</span>}
          </div>
          {goal.reminderTime && <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-2"><Bell size={12} /> Lembrete no fim de cada período, às {goal.reminderTime}</p>}
          <details className="mt-4 text-sm"><summary className="cursor-pointer text-ink-2">Períodos e histórico</summary>
            <div className="mt-2 max-h-64 space-y-2 overflow-y-auto overscroll-contain">
              {goal.periods.map(p => <div key={p.start} className="flex items-center justify-between gap-2 border-t border-line py-2">
                <div className="min-w-0"><p className="text-xs">{periodLabel(p)}</p><p className="text-xs text-ink-2">Meta: {money(p.targetCents)}</p><p className={`text-xs ${p.savedCents !== null && p.savedCents >= p.targetCents ? "text-green" : "text-ink-2"}`}>{p.savedCents === null ? p.available ? "Sem registro" : "Agendado" : `${p.savedCents >= p.targetCents ? "Cumprida" : "Não cumprida"} · ${money(p.savedCents)}`}</p></div>
                {p.available && <button className="btn btn-ghost shrink-0 px-2 text-xs" aria-label={`Registrar ${periodLabel(p)} em ${goal.name}`} onClick={() => setRecording({ goal, start: p.start })}>{p.savedCents === null ? "Registrar" : "Editar"}</button>}
              </div>)}
            </div>
          </details>
        </article>;
      })}
    </div>
    <p className="text-xs text-ink-3">Os registros acompanham sua reserva e não alteram os saldos das contas. Para receber os lembretes, <Link href="/perfil#notificacoes" className="underline underline-offset-2">ative as notificações no seu aparelho</Link>.</p>
    {creating && <SavingsForm space={space} today={today} onClose={() => setCreating(false)} onSaved={refresh} />}
    {recording && <SavingsRecord key={recording.goal.id + recording.start} {...recording} space={space} onClose={() => setRecording(null)} onSaved={refresh} />}
  </section>;
}

function SavingsForm({ space, today, onClose, onSaved }: { space: FinanceSpace; today: string; onClose: () => void; onSaved: () => void }) {
  const [frequency, setFrequency] = useState<SavingsFrequency>("monthly");
  const [mode, setMode] = useState("period");
  const [amount, setAmount] = useState("");
  const [start, setStart] = useState(today);
  const [duration, setDuration] = useState("3");
  const [unit, setUnit] = useState("months");
  const [reminder, setReminder] = useState(true);
  const [time, setTime] = useState("20:00");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  let end = "", plan: ReturnType<typeof savingsPlan> | null = null, previewError = "";
  try {
    end = savingsEnd(start, Number(duration), unit);
    if (amount) plan = savingsPlan({ frequency, mode, amountCents: parseMoney(amount) ?? 0, startDay: start, endDay: end });
  } catch (e) { previewError = e instanceof Error ? e.message : "Confira os valores."; }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!plan || busy) return;
    const name = new FormData(e.currentTarget).get("name");
    setBusy(true); setError("");
    try { await http.post(`/api/financeiro/${space}/metas`, { name, frequency, mode, amount, startDay: start, endDay: end, reminderTime: reminder ? time : null }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  return <Modal open onClose={() => { if (!busy) onClose(); }} title={<><h2 className="text-lg font-semibold">Nova meta financeira</h2><p className="text-xs text-ink-2">{spaceNames[space]}</p></>}>
    <form className="space-y-4 text-sm" onSubmit={save}>
      <label className="block">Nome da meta<input name="name" className="input mt-1" required maxLength={80} placeholder="Ex.: Reserva para viagem" /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label>Frequência<select aria-label="Frequência" className="input mt-1" value={frequency} onChange={e => setFrequency(e.target.value as SavingsFrequency)}>{Object.entries(frequencies).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div>Data de início<DateField value={start} onChange={setStart} ariaLabel="Início da meta" className="mt-1" /></div></div>
      <div><p>Duração do projeto</p><div className="mt-1 flex gap-2"><input className="input min-w-0" type="number" min={1} max={3660} required aria-label="Duração do projeto" value={duration} onChange={e => setDuration(e.target.value)} /><select className="input" aria-label="Unidade da duração" value={unit} onChange={e => setUnit(e.target.value)}><option value="days">dias</option><option value="weeks">semanas</option><option value="months">meses</option></select></div>{end && <p className="mt-1 text-xs text-ink-2">Termina em {shortDay(end)}</p>}</div>
      <label className="block">Como quer definir a meta?<select aria-label="Como quer definir a meta?" className="input mt-1" value={mode} onChange={e => setMode(e.target.value)}><option value="period">Valor por {frequencyUnits[frequency]}</option><option value="total">Valor total que quero guardar</option></select></label>
      <label className="block">{mode === "total" ? "Valor total (R$)" : `Valor por ${frequencyUnits[frequency]} (R$)`}<input className="input mt-1" inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" /></label>
      {plan && <div aria-live="polite" className="rounded-xl border border-line bg-fill p-3"><p className="font-semibold">Total previsto: {money(plan.totalCents)}</p><p className="mt-1 text-ink-2">{plan.periods.length} contribuições · {plan.days} dias</p><p className="text-ink-2">{money(plan.periods.at(-1)!.targetCents)}{plan.periods[0].targetCents !== plan.periods.at(-1)!.targetCents ? ` a ${money(plan.periods[0].targetCents)}` : ""} por {frequencyUnits[frequency]}</p><p className="mt-1 text-xs text-ink-3">Os períodos começam na data de início. O último período, mesmo mais curto, conta como uma contribuição.</p></div>}
      {previewError && <p role="alert" className="text-red">{previewError}</p>}
      <label className="flex items-center gap-2"><input type="checkbox" checked={reminder} onChange={e => setReminder(e.target.checked)} /> Lembrar de registrar no fim de cada período</label>
      {reminder && <div>Horário do lembrete<TimeField className="mt-1" value={time} onChange={setTime} ariaLabel="Horário do lembrete financeiro" /><p className="mt-1 text-xs text-ink-3">Receba no aparelho com notificações ativadas. Horário de Brasília.</p></div>}
      {error && <p role="alert" className="text-red">{error}</p>}
      <button disabled={busy || !plan} className="btn btn-primary">{busy ? "Salvando…" : "Criar meta"}</button>
    </form>
  </Modal>;
}

function SavingsRecord({ goal, start, space, onClose, onSaved }: { goal: SavingsGoalView; start: string; space: FinanceSpace; onClose: () => void; onSaved: () => void }) {
  const period = goal.periods.find(p => p.start === start)!;
  const [answer, setAnswer] = useState(period.savedCents === 0 ? "none" : "saved");
  const [amount, setAmount] = useState(decimal(period.savedCents ?? period.targetCents));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const cents = answer === "none" ? 0 : parseMoney(amount);
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (busy || cents === null) return;
    setBusy(true); setError("");
    try { await http.post(`/api/financeiro/${space}/registros-meta`, { id: goal.id, periodStart: start, amount: answer === "none" ? "0" : amount }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  return <Modal open onClose={() => { if (!busy) onClose(); }} title={<><h2 className="text-lg font-semibold">Registrar período</h2><p className="break-words text-sm text-ink-2">{goal.name} · {periodLabel(period)}</p></>}>
    <form onSubmit={save} className="space-y-4 text-sm">
      <p>Meta deste período: <strong>{money(period.targetCents)}</strong></p>
      <label className="block">Como foi neste período?<select aria-label="Como foi neste período?" value={answer} onChange={e => setAnswer(e.target.value)} className="input mt-1"><option value="saved">Guardei um valor</option><option value="none">Não guardei</option></select></label>
      {answer === "saved" && <label className="block">Quanto guardou (R$)<input className="input mt-1" inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} /></label>}
      {cents !== null && <p aria-live="polite" className={cents >= period.targetCents ? "text-green" : "text-orange"}>{cents >= period.targetCents ? "Meta do período cumprida." : "Meta do período não cumprida."} Guardado: {money(cents)}.</p>}
      <p className="text-xs text-ink-3">Informe o total guardado neste período. Editar substitui o valor anterior.</p>
      {error && <p role="alert" className="text-red">{error}</p>}
      <button className="btn btn-primary" disabled={busy || cents === null}>{busy ? "Salvando…" : "Salvar registro"}</button>
    </form>
  </Modal>;
}
