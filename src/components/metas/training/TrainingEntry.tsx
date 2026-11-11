import { useRef, useState, type FormEvent } from "react";
import { DateField } from "@/components/ui/DateField";
import { http } from "@/lib/client";
import { keyToDate } from "@/lib/time";
import { elapsedLabel, paceSeconds, parseElapsed, type DayPlan, type Exercise } from "@/lib/training-types";
import { isFightStyle, type Workout } from "@/lib/workouts";
import { ExerciseFields } from "./Exercises";

export function TrainingEntry({ projectId, sport, plans, today, onSave }: {
  projectId: string; today: string; sport: Workout; plans: DayPlan[]; onSave: () => void;
}) {
  const [date, setDate] = useState(today);
  const [km, setKm] = useState("");
  const [time, setTime] = useState("");
  const [byPace, setByPace] = useState(false);
  const [draft, setDraft] = useState<Exercise[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string | null>(null);
  const distanceSport = sport === "running" || sport === "cycling";
  const meters = Math.round(Number(km.replace(",", ".")) * 1000);
  const rawTime = parseElapsed(time);
  const seconds = byPace ? Math.round(rawTime * meters / 1000) : rawTime;
  const planned = plans.find(p => p.weekday === keyToDate(date).getDay());
  const exercises = draft ?? planned?.exercises ?? [];
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if ((sport !== "strength" || time.trim()) && !(seconds > 0)) { setError("Informe uma duração válida."); return; }
    if (distanceSport && !(meters > 0)) { setError("Informe a distância em quilômetros."); return; }
    if (sport === "strength" && !exercises.length) { setError("Adicione os exercícios realizados."); return; }
    setBusy(true);
    try {
      requestId.current ??= crypto.randomUUID();
      await http.post("/api/treinos/" + projectId + "/registros", {
        id: requestId.current, sport, dayKey: date, durationSeconds: seconds || null,
        distanceMeters: distanceSport ? meters : null, exercises: sport === "strength" ? exercises : [],
      });
      requestId.current = null; setTime(""); setKm(""); setDraft(null); onSave();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao registrar."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="space-y-4">
    <label className="block text-sm">Data do treino<DateField className="mt-1" ariaLabel="Data do treino" value={date} max={today} onChange={v => { setDate(v); setDraft(null); }} /></label>
    {sport === "strength" && <div className="space-y-2">
      <h3 className="text-sm font-medium">Exercícios realizados</h3>
      {planned?.exercises.length && draft === null ? <p className="text-xs text-ink-2">Carregados do plano deste dia. Ajuste as séries, repetições e cargas que fez.</p> : null}
      <ExerciseFields rows={exercises} onChange={setDraft} />
    </div>}
    {distanceSport && <label className="block text-sm">Distância (km)
      <input required className="input mt-1" inputMode="decimal" placeholder="5,0" value={km} onChange={e => setKm(e.target.value)} />
    </label>}
    <label className="block text-sm">{byPace ? "Pace (min/km)" : sport === "strength" ? "Duração (opcional)" : isFightStyle(sport) ? "Tempo de luta" : "Tempo de treino"}
      <input className="input mt-1" required={sport !== "strength"} placeholder={byPace ? "5:30" : "min:seg ou h:min:seg"} value={time} onChange={e => setTime(e.target.value)} />
    </label>
    {distanceSport && <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-ink-2">{seconds > 0 && meters > 0 ? byPace ? "Tempo total · " + elapsedLabel(seconds) : "Pace · " + elapsedLabel(paceSeconds(seconds, meters)) + " min/km" : ""}</span>
      <button type="button" className="btn btn-ghost text-xs" onClick={() => {
        const next = byPace ? seconds : paceSeconds(seconds, meters);
        setTime(Number.isFinite(next) && next > 0 ? elapsedLabel(next) : ""); setByPace(!byPace);
      }}>{byPace ? "Informar tempo total" : "Informar pace"}</button>
    </div>}
    {error && <p role="alert" className="text-sm text-red">{error}</p>}
    <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar treino"}</button>
  </form>;
}
