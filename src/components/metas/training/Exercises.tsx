import { Pencil, Plus, X } from "lucide-react";
import type { Exercise } from "@/lib/training-types";

export const blankExercise = (): Exercise => ({ name: "", sets: 0, reps: "", weightKg: null });

export function ExerciseInputs({ row, onChange, remove }: {
  row: Exercise; onChange: (patch: Partial<Exercise>) => void; remove?: React.ReactNode;
}) {
  return <>
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-xs text-ink-2">Exercício<input required className="input mt-1 min-w-0 max-sm:text-base" value={row.name} onChange={e => onChange({ name: e.target.value })} placeholder="Nome do exercício" /></label>
        {remove}
      </div>
      <label className="block text-xs text-ink-2">Exercício substituto <span className="text-ink-3">(opcional)</span>
        <input className="input mt-1 min-w-0 max-sm:text-base" maxLength={180} placeholder="Alternativa ao exercício principal" value={row.substitute ?? ""} onChange={e => onChange({ substitute: e.target.value })} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-ink-2">Séries<input required type="number" min="1" step="1" className="input mt-1 min-w-0 max-sm:text-base" value={row.sets || ""} onChange={e => onChange({ sets: Number(e.target.value) })} /></label>
        <label className="text-xs text-ink-2">Repetições<input required maxLength={80} placeholder="10 ou 8–12" className="input mt-1 min-w-0 max-sm:text-base" value={row.reps || ""} onChange={e => onChange({ reps: e.target.value })} /></label>
        <label className="text-xs text-ink-2">Carga (kg)<input type="number" min="0" step="any" className="input mt-1 min-w-0 max-sm:text-base" value={row.weightKg ?? ""} onChange={e => onChange({ weightKg: e.target.value === "" ? null : Number(e.target.value) })} /></label>
      </div>
  </>;
}

export function ExerciseFields({ rows, onChange }: { rows: Exercise[]; onChange: (rows: Exercise[]) => void }) {
  function change(index: number, patch: Partial<Exercise>) {
    onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  }
  return <div className="space-y-2">
    {rows.map((row, i) => <fieldset key={i} aria-label={"Exercício " + (i + 1)} className="min-w-0 space-y-2 rounded-xl border border-line bg-well p-3">
      <ExerciseInputs row={row} onChange={patch => change(i, patch)} remove={<button type="button" className="btn btn-ghost h-10 px-2" aria-label={"Remover exercício " + (i + 1)} onClick={() => onChange(rows.filter((_, index) => i !== index))}><X size={15} /></button>} />
    </fieldset>)}
    <button type="button" className="btn" onClick={() => onChange([...rows, blankExercise()])}><Plus size={14} /> Adicionar exercício</button>
  </div>;
}
export function ExerciseList({ exercises, onEdit, checked, onCheck }: {
  exercises: Exercise[]; onEdit?: (index: number) => void;
  checked?: number[]; onCheck?: (index: number) => void;
}) {
  return <ul className="divide-y divide-line">{exercises.map((e, i) =>
    <li key={i} className="flex min-w-0 items-center gap-2 py-2 text-sm">
      {onCheck && <label className="grid h-11 w-9 shrink-0 cursor-pointer place-items-center">
        <input type="checkbox" className="size-5 accent-orange" aria-label={"Concluir " + e.name}
          checked={checked?.includes(i) ?? false} onChange={() => onCheck(i)} />
      </label>}
      {onEdit && <button type="button" className="btn btn-ghost size-11 shrink-0 p-0" aria-label={"Editar " + e.name}
        onClick={() => onEdit(i)}><Pencil size={15} /></button>}
      <div className="min-w-0 flex-1">
        <div className="break-words font-medium">{e.name}</div>
        <div className="text-xs text-ink-2">{e.sets} × {e.reps}{typeof e.reps === "number" ? " rep." : ""}{e.weightKg != null && " · " + e.weightKg.toLocaleString("pt-BR") + " kg"}</div>
        {e.substitute && <div className="break-words text-xs text-ink-2">Substituto: {e.substitute}</div>}
      </div>
    </li>)}</ul>;
}
