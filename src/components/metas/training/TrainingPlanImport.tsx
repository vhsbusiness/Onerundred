import { FileUp, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { http } from "@/lib/client";
import { PLAN_FILE_LIMIT, PLAN_FILE_TYPES, WEEKDAYS, WEEK_ORDER, type DayPlan, type ImportedDay } from "@/lib/training-types";
import { ExerciseFields } from "./Exercises";

export function TrainingPlanImport({ projectId, existing, onSaved, onClose }: {
  projectId: string; existing: DayPlan[]; onSaved: (day: number) => void; onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<ImportedDay[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = "/api/treinos/" + projectId + "/plano";
  const replaced = WEEK_ORDER.filter(d => draft?.some(group => group.weekday === d && group.exercises.length) && existing.some(plan => plan.weekday === d && plan.exercises.length));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(""); setBusy(true);
    try {
      if (!draft) {
        if (!file || !PLAN_FILE_TYPES.includes(file.type)) throw new Error("Escolha uma imagem JPG, PNG, WebP ou PDF.");
        if (file.size > PLAN_FILE_LIMIT) throw new Error("Escolha um arquivo de até 8 MB.");
        const response = await fetch(url + "/importar", { method: "POST", body: file, headers: { "Content-Type": file.type } });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.days) throw new Error(data?.error ?? "Não foi possível ler o arquivo. Tente novamente.");
        setDraft(data.days);
      } else {
        const plans = WEEK_ORDER.map(weekday => ({ weekday, exercises: draft.filter(d => d.weekday === weekday).flatMap(d => d.exercises) })).filter(d => d.exercises.length);
        if (!plans.length || draft.some(d => d.weekday < 0 && d.exercises.length)) throw new Error("Escolha um dia para cada grupo de exercícios.");
        await http.put(url, { days: plans });
        onSaved(plans[0].weekday);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível importar o plano."); }
    finally { setBusy(false); }
  }

  return <Modal open onClose={() => { if (!busy) onClose(); }} title={<h2 className="font-semibold">{draft ? "Revisar plano de treino" : "Importar ficha com IA"}</h2>}>
    <form onSubmit={submit} className="min-w-0 space-y-4">
      {!draft ? <>
        <p className="text-sm text-ink-2">Envie uma foto ou um PDF da sua ficha. A IA separa os exercícios por dia para você revisar.</p>
        <label className="block text-sm">Arquivo da ficha
          <input type="file" required disabled={busy} accept={PLAN_FILE_TYPES.join(",")} onChange={e => { setFile(e.target.files?.[0] ?? null); setError(""); }}
            className="input mt-2 block w-full min-w-0 text-xs" />
          <span className="mt-1 block text-xs text-ink-2">JPG, PNG, WebP ou PDF · até 8 MB</span>
        </label>
      </> : <>
        <p className="text-sm text-ink-2">Confira os exercícios e complete o que não estava legível. Para fichas A/B sem dia indicado, escolha o dia da semana.</p>
        {draft.map((d, i) => <section key={i} className="space-y-3">
          <label className="block text-sm font-medium">{d.label || "Grupo " + (i + 1)}
            <select className="input mt-1" aria-label={"Dia do grupo " + (i + 1)} required={!!d.exercises.length} value={d.weekday < 0 ? "" : d.weekday}
              onChange={e => setDraft(draft.map((g, j) => j === i ? { ...g, weekday: e.target.value === "" ? -1 : Number(e.target.value) } : g))}>
              <option value="">Escolha o dia</option>{WEEK_ORDER.map(day => <option key={day} value={day}>{WEEKDAYS[day]}</option>)}
            </select>
          </label>
          <ExerciseFields rows={d.exercises} onChange={exercises => setDraft(draft.map((g, j) => j === i ? { ...g, exercises } : g))} />
        </section>)}
        {replaced.length > 0 && <p className="text-sm text-orange">Ao salvar, o plano atual será substituído em: {replaced.map(d => WEEKDAYS[d]).join(", ")}. Os outros dias serão mantidos.</p>}
      </>}
      {error && <p role="alert" className="text-sm text-red">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy || (!draft && !file)}>
          {busy ? <LoaderCircle size={14} className="motion-safe:animate-spin" /> : !draft ? <FileUp size={14} /> : null}
          {busy ? (draft ? "Salvando…" : "Lendo ficha…") : draft ? "Salvar dias revisados" : "Ler ficha com IA"}
        </button>
        <button className="btn btn-ghost" type="button" disabled={busy} onClick={onClose}>Cancelar</button>
      </div>
    </form>
  </Modal>;
}
