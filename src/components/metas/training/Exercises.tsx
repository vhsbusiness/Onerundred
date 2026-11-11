import { Plus, X } from "lucide-react";
import type { Exercise } from "@/lib/training-types";

export function ExerciseFields({ rows, onChange }: { rows: Exercise[]; onChange: (rows: Exercise[]) => void }) {
  function change(index: number, patch: Partial<Exercise>) {
    onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  }
  return <div className="space-y-2">
    {rows.map((row, i) => <fieldset key={i} aria-label={"Exercício " + (i + 1)} className="min-w-0 space-y-2 rounded-xl border border-line bg-well p-3">
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-xs text-ink-2">Exercício<input required className="input mt-1" value={row.name} onChange={e => change(i, { name: e.target.value })} placeholder="Nome do exercício" /></label>
        <button type="button" className="btn btn-ghost h-10 px-2" aria-label={"Remover exercício " + (i + 1)} onClick={() => onChange(rows.filter((_, index) => i !== index))}><X size={15} /></button>
      </div>
      <label className="block text-xs text-ink-2">Exercício substituto <span className="text-ink-3">(opcional)</span>
        <input className="input mt-1" maxLength={180} placeholder="Alternativa ao exercício principal" value={row.substitute ?? ""} onChange={e => change(i, { substitute: e.target.value })} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-ink-2">Séries<input required type="number" min="1" step="1" className="input mt-1" value={row.sets || ""} onChange={e => change(i, { sets: Number(e.target.value) })} /></label>
        <label className="text-xs text-ink-2">Repetições<input required maxLength={80} placeholder="10 ou 8–12" className="input mt-1" value={row.reps || ""} onChange={e => change(i, { reps: e.target.value })} /></label>
        <label className="text-xs text-ink-2">Carga (kg)<input type="number" min="0" step="any" className="input mt-1" value={row.weightKg ?? ""} onChange={e => change(i, { weightKg: e.target.value === "" ? null : Number(e.target.value) })} /></label>
      </div>
    </fieldset>)}
    <button type="button" className="btn" onClick={() => onChange([...rows, { name: "", sets: 0, reps: 0, weightKg: null }])}><Plus size={14} /> Adicionar exercício</button>
  </div>;
}
export function ExerciseList({ exercises }: { exercises: Exercise[] }) {
  return <ul className="divide-y divide-line">{exercises.map((e, i) =>
    <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-sm">
      <span className="min-w-0 break-words font-medium">{e.name}</span><span className="text-xs text-ink-2">{e.sets} × {e.reps}{typeof e.reps === "number" ? " rep." : ""}{e.weightKg != null && " · " + e.weightKg.toLocaleString("pt-BR") + " kg"}</span>
      {e.substitute && <span className="w-full break-words text-xs text-ink-2">Substituto: {e.substitute}</span>}
    </li>
  )}</ul>;
}
