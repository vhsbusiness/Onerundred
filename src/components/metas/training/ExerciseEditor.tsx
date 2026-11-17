import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, X } from "lucide-react";
import type { Exercise } from "@/lib/training-types";
import { blankExercise, ExerciseInputs, ExerciseList } from "./Exercises";

export function EditableExercises({ exercises, onChange, checked, onCheck, allowAdd = true }: {
  exercises: Exercise[]; onChange: (rows: Exercise[], removed: number | undefined, previous: Exercise[]) => void | Promise<void>;
  allowAdd?: boolean; checked?: number[]; onCheck?: (index: number) => void;
}) {
  const [editing, setEditing] = useState<{ index: number; original: Exercise[] } | null>(null);
  const open = (index: number) => setEditing({ index, original: exercises });
  return <>
    <ExerciseList exercises={exercises} onEdit={open} checked={checked} onCheck={onCheck} />
    {allowAdd && <button type="button" className="btn" onClick={() => open(exercises.length)}><Plus size={15} /> Adicionar exercício</button>}
    {editing && <ExerciseEditor initial={editing.original[editing.index]} onClose={() => setEditing(null)} onSave={async value => {
      const { index, original } = editing;
      const next = original.slice();
      if (value) next[index] = value;
      else next.splice(index, 1);
      await onChange(next, value ? undefined : index, original);
      setEditing(null);
    }} />}
  </>;
}

function ExerciseEditor({ initial, onClose, onSave }: {
  initial?: Exercise; onClose: () => void; onSave: (value: Exercise | null) => Promise<void>;
}) {
  const [row, setRow] = useState(initial ?? blankExercise);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const viewport = window.visualViewport;
    function fit() {
      el.style.setProperty("--editor-height", (viewport?.height ?? window.innerHeight) + "px");
      el.style.setProperty("--editor-top", (viewport?.offsetTop ?? 0) + "px");
    }
    fit();
    el.showModal();
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);
    return () => { el.close(); viewport?.removeEventListener("resize", fit); viewport?.removeEventListener("scroll", fit); };
  }, []);
  async function apply(value: Exercise | null) {
    if (busy) return;
    setBusy(true); setError("");
    try { await onSave(value); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar."); setBusy(false); }
  }
  function submit(e: FormEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!row.name.trim() || !String(row.reps).trim()) { setError("Preencha o nome e as repetições."); return; }
    void apply({ ...row, name: row.name.trim() });
  }
  return createPortal(<dialog ref={ref} className="training-exercise-dialog card" aria-label={initial ? "Editar exercício" : "Adicionar exercício"}
    onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={submit} className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <h2 className="font-semibold">{initial ? "Editar exercício" : "Adicionar exercício"}</h2>
        <button type="button" autoFocus aria-label="Fechar editor" className="btn btn-ghost size-11 p-0" disabled={busy} onClick={onClose}><X size={16} /></button>
      </div>
      <fieldset disabled={busy} className="min-h-0 min-w-0 space-y-3 overflow-y-auto overscroll-contain p-4">
        <ExerciseInputs row={row} onChange={patch => setRow(value => ({ ...value, ...patch }))} />
        {error && <p role="alert" className="text-sm text-red">{error}</p>}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-3">
        {initial && <button type="button" disabled={busy} className="btn btn-ghost text-red" onClick={() => removing ? void apply(null) : setRemoving(true)}>
          <Trash2 size={15} /> {removing ? "Confirmar exclusão" : "Excluir"}
        </button>}
        <button type="submit" disabled={busy} className="btn btn-primary ml-auto">{busy ? "Salvando…" : "Salvar exercício"}</button>
      </div>
    </form>
  </dialog>, document.body);
}
