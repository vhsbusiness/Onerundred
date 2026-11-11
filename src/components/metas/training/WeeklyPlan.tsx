import { useState } from "react";
import { FileUp, Pencil } from "lucide-react";
import { http } from "@/lib/client";
import { Modal } from "@/components/ui/Modal";
import { WEEKDAYS, WEEK_ORDER, type DayPlan, type Exercise } from "@/lib/training-types";
import { TrainingPlanImport } from "./TrainingPlanImport";
import { ExerciseFields, ExerciseList } from "./Exercises";

export function WeeklyPlan({ projectId, plans, initialDay, onSave }: {
  projectId: string; plans: DayPlan[]; initialDay: number; onSave: () => void;
}) {
  const [importing, setImporting] = useState(false);
  const [day, setDay] = useState(initialDay);
  const [draft, setDraft] = useState<Exercise[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = plans.find(p => p.weekday === day)?.exercises ?? [];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || busy) return;
    const plan = { weekday: day, exercises: draft };
    setBusy(true); setError("");
    try { await http.put("/api/treinos/" + projectId + "/plano", plan); onSave(); setDraft(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Erro ao salvar."); }
    finally { setBusy(false); }
  }
  return <><section className="card space-y-3 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Plano semanal de musculação</h2>
      <button type="button" className="btn" onClick={() => setImporting(true)}><FileUp size={14} /> Importar ficha com IA</button>
    </div>
    <div role="group" aria-label="Dia da semana" className="grid grid-cols-7 gap-1">
      {WEEK_ORDER.map(d => <button key={d} type="button" title={WEEKDAYS[d]} aria-label={WEEKDAYS[d]} aria-pressed={d === day} onClick={() => setDay(d)} className={"btn min-w-0 px-0 text-xs " + (day === d ? "pill-orange" : "btn-ghost")}>{WEEKDAYS[d].slice(0,3)}</button>)}
    </div>
    {rows.length ? <ExerciseList exercises={rows} /> : <p className="text-sm text-ink-3">Sem exercícios planejados para {WEEKDAYS[day].toLowerCase()}.</p>}
    <button type="button" className="btn" onClick={() => { setDraft(rows); setError(""); }}><Pencil size={14} /> Editar treino de {WEEKDAYS[day].toLowerCase()}</button>
  </section>
    {importing && <TrainingPlanImport projectId={projectId} existing={plans} onClose={() => setImporting(false)}
      onSaved={firstDay => { setDay(firstDay); setImporting(false); onSave(); }} />}
    {draft && <Modal open onClose={() => { if (!busy) setDraft(null); }} title={<h2 className="text-lg font-semibold">Treino de {WEEKDAYS[day].toLowerCase()}</h2>}>
      <form className="space-y-4" onSubmit={save}>
        <ExerciseFields rows={draft} onChange={setDraft} />
        {error && <p role="alert" className="text-sm text-red">{error}</p>}
        <button disabled={busy} className="btn btn-primary">Salvar plano</button>
      </form>
    </Modal>}
  </>;
}
