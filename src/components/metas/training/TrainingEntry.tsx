import { useEffect, useState, type FormEvent } from "react";
import { DateField } from "@/components/ui/DateField";
import { Pause, Play, Timer } from "lucide-react";
import { http, useNow } from "@/lib/client";
import { keyToDate } from "@/lib/time";
import { elapsedLabel, paceSeconds, parseElapsed, type DayPlan, type Exercise } from "@/lib/training-types";
import { isFightStyle, type Workout } from "@/lib/workouts";
import { EditableExercises } from "./ExerciseEditor";

type SessionDraft = {
  version: 1; date: string; draft: Exercise[] | null; checked: number[]; startedAt: number | null;
  elapsedMs: number; km: string; time: string; byPace: boolean; requestId: string | null;
};
function emptySession(date: string): SessionDraft {
  return { version: 1, date, draft: null, checked: [], startedAt: null, elapsedMs: 0,
    km: "", time: "", byPace: false, requestId: null };
}

export function TrainingEntry({ projectId, sport, plans, today, onSave }: {
  projectId: string; today: string; sport: Workout; plans: DayPlan[]; onSave: () => void;
}) {
  const key = "training-session:" + projectId + ":" + sport;
  const [session, setSession] = useState(() => emptySession(today));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { date, km, time, byPace, draft, checked, startedAt, elapsedMs } = session;
  const now = useNow(startedAt !== null, 500);
  const elapsed = Math.floor((elapsedMs + (startedAt ? Math.max(0, now - startedAt) : 0)) / 1000);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored.version === 1 && Array.isArray(stored.checked))
          // eslint-disable-next-line react-hooks/set-state-in-effect -- restore this device's unfinished workout after hydration.
          setSession(stored);
      }
    } catch { /* The form also works without local storage. */ }
    setReady(true);
  }, [key]);
  function update(patch: Partial<SessionDraft>) {
    const next = { ...session, ...patch };
    setSession(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Keep editing in memory. */ }
  }
  function stopClock() {
    const ms = elapsedMs + (startedAt ? Math.max(0, Date.now() - startedAt) : 0);
    update({ elapsedMs: ms, startedAt: null, time: elapsedLabel(Math.max(1, Math.floor(ms / 1000))), byPace: false });
  }
  const distanceSport = sport === "running" || sport === "cycling";
  const meters = Math.round(Number(km.replace(",", ".")) * 1000);
  const rawTime = parseElapsed(time);
  const seconds = startedAt ? elapsed : byPace ? Math.round(rawTime * meters / 1000) : rawTime;
  const planned = plans.find(p => p.weekday === keyToDate(date).getDay());
  const exercises = draft ?? planned?.exercises ?? [];
  async function save(event: FormEvent, finishedAt: number) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const duration = startedAt ? Math.max(1, Math.floor((elapsedMs + Math.max(0, finishedAt - startedAt)) / 1000)) : seconds;
    if ((sport !== "strength" || time.trim()) && !(duration > 0)) { setError("Informe uma duração válida."); return; }
    if (distanceSport && !(meters > 0)) { setError("Informe a distância em quilômetros."); return; }
    const completed = exercises.filter((_, i) => checked.includes(i));
    if (sport === "strength" && !completed.length) { setError("Marque pelo menos um exercício realizado."); return; }
    setBusy(true);
    try {
      const id = session.requestId ?? crypto.randomUUID();
      update({ requestId: id, ...(startedAt ? { startedAt: null, elapsedMs: duration * 1000, time: elapsedLabel(duration), byPace: false } : {}) });
      await http.post("/api/treinos/" + projectId + "/registros", {
        id, sport, dayKey: date, durationSeconds: duration || null,
        distanceMeters: distanceSport ? meters : null, exercises: sport === "strength" ? completed : [],
      });
      setSession(emptySession(today));
      try { localStorage.removeItem(key); } catch { /* Already reset in memory. */ }
      onSave();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao registrar."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={e => void save(e, performance.timeOrigin + e.timeStamp)}><fieldset disabled={!ready || busy} className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <Timer size={17} aria-hidden="true" className="text-orange" />
      <span role="timer" aria-label="Cronômetro do treino" className="text-2xl font-semibold tabular-nums">{elapsedLabel(elapsed)}</span>
      {startedAt ? <button type="button" className="btn" onClick={stopClock}><Pause size={15} /> Pausar treino</button>
        : <button type="button" className="btn" onClick={() => update({ startedAt: Date.now(), byPace: false })}><Play size={15} />
          {elapsedMs ? "Retomar treino" : "Iniciar treino"}</button>}
    </div>
    <label className="block text-sm">Data do treino<DateField className="mt-1" ariaLabel="Data do treino" value={date} max={today} onChange={v => { if (v !== date) update({ date: v, draft: null, checked: [], requestId: null }); }} /></label>
    {sport === "strength" && <div className="space-y-2">
      <h3 className="text-sm font-medium">Checklist do treino <span className="ml-1 text-ink-2">{checked.length} de {exercises.length}</span></h3>
      <EditableExercises exercises={exercises} checked={checked} onCheck={i => update({ draft: exercises,
        checked: checked.includes(i) ? checked.filter(n => n !== i) : [...checked, i] })}
        onChange={(rows, removed) => update({ draft: rows, checked: removed === undefined ? checked :
          checked.filter(n => n !== removed).map(n => n > removed ? n - 1 : n) })} />
    </div>}
    {distanceSport && <label className="block text-sm">Distância (km)
      <input required className="input mt-1" inputMode="decimal" placeholder="5,0" value={km} onChange={e => update({ km: e.target.value })} />
    </label>}
    <label className="block text-sm">{byPace ? "Pace (min/km)" : sport === "strength" ? "Duração (opcional)" : isFightStyle(sport) ? "Tempo de luta" : "Tempo de treino"}
      <input className="input mt-1" required={sport !== "strength" && !startedAt} placeholder={byPace ? "5:30" : "min:seg ou h:min:seg"} disabled={startedAt !== null} value={startedAt ? elapsedLabel(elapsed) : time} onChange={e => update({ time: e.target.value })} />
    </label>
    {distanceSport && <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-ink-2">{seconds > 0 && meters > 0 ? byPace ? "Tempo total · " + elapsedLabel(seconds) : "Pace · " + elapsedLabel(paceSeconds(seconds, meters)) + " min/km" : ""}</span>
      <button type="button" disabled={startedAt !== null} className="btn btn-ghost text-xs" onClick={() => {
        const next = byPace ? seconds : paceSeconds(seconds, meters);
        update({ time: Number.isFinite(next) && next > 0 ? elapsedLabel(next) : "", byPace: !byPace });
      }}>{byPace ? "Informar tempo total" : "Informar pace"}</button>
    </div>}
    {error && <p role="alert" className="text-sm text-red">{error}</p>}
    <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : startedAt ? "Concluir treino" : "Salvar treino"}</button>
  </fieldset></form>;
}
