import { useState } from "react";
import { FileUp } from "lucide-react";
import { http } from "@/lib/client";
import { trainingPlanLabel, TRAINING_ORDER, type DayPlan, type Exercise } from "@/lib/training-types";
import { TrainingPlanImport } from "./TrainingPlanImport";
import { EditableExercises } from "./ExerciseEditor";

export function WeeklyPlan({ projectId, plans, day, onDay, onSave }: {
  projectId: string; plans: DayPlan[]; day: number; onDay: (day: number) => void; onSave: () => void;
}) {
  const [importing, setImporting] = useState(false);
  const rows = plans.find(p => p.weekday === day)?.exercises ?? [];
  async function save(exercises: Exercise[], _removed: number | undefined, previous: Exercise[]) {
    await http.put("/api/treinos/" + projectId + "/plano", { weekday: day, exercises, previous });
    onSave();
  }
  return <><section className="card space-y-3 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Plano de musculação</h2>
      <button type="button" className="btn" onClick={() => setImporting(true)}><FileUp size={14} /> Importar ficha com IA</button>
    </div>
    <div role="group" aria-label="Treinos de musculação" className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-1">
      {TRAINING_ORDER.map(d => <button key={d} type="button" aria-label={trainingPlanLabel(d)} aria-pressed={d === day} onClick={() => onDay(d)}
        className={"btn min-w-0 px-0 text-xs " + (day === d ? "pill-orange" : "btn-ghost")}>{trainingPlanLabel(d)}</button>)}
    </div>
    {!rows.length && <p className="text-sm text-ink-3">Sem exercícios planejados no {trainingPlanLabel(day)}.</p>}
    <EditableExercises key={day} exercises={rows} onChange={save} />
  </section>
    {importing && <TrainingPlanImport projectId={projectId} existing={plans} onClose={() => setImporting(false)}
      onSaved={firstDay => { onDay(firstDay); setImporting(false); onSave(); }} />}
  </>;
}
