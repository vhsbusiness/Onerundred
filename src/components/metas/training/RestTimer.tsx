import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { http } from "@/lib/client";
import { elapsedLabel } from "@/lib/training-types";

type ClockState = { end: number | null; left: number | null };
const idle: ClockState = { end: null, left: null };

function remember(key: string, state: ClockState) {
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* O contador funciona mesmo sem armazenamento local. */ }
}
export function RestTimer({ projectId, initialSeconds }: { projectId: string; initialSeconds: number }) {
  const router = useRouter();
  const key = "training-rest:" + projectId;
  const [seconds, setSeconds] = useState(String(initialSeconds));
  const [saved, setSaved] = useState(initialSeconds);
  const [clock, setClock] = useState<ClockState>(idle);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const preset = Number(seconds);
  const end = clock.end;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const value = JSON.parse(raw);
      if (typeof value.end === "number" && Number.isFinite(value.end)) {
        const left = Math.max(0, Math.ceil((value.end - Date.now()) / 1000));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restaura a contagem deste projeto depois da hidratação.
        setClock({ end: left ? value.end : null, left });
      } else if (Number.isInteger(value.left) && value.left >= 0) setClock({ end: null, left: value.left });
    } catch { /* Um valor local inválido começa com o tempo configurado. */ }
  }, [key]);
  useEffect(() => {
    if (end === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      const state = { end: left ? end : null, left };
      setClock(state);
      if (!left) remember(key, state);
    };
    const interval = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [end, key]);
  function update(state: ClockState) { setClock(state); remember(key, state); }
  async function start() {
    if (busy || !Number.isInteger(preset) || preset <= 0) return;
    setBusy(true); setError("");
    try {
      if (preset !== saved) {
        await http.patch("/api/treinos/" + projectId, { restSeconds: preset });
        setSaved(preset);
        router.refresh();
      }
      const left = clock.left || preset;
      update({ end: Date.now() + left * 1000, left });
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar o descanso."); }
    finally { setBusy(false); }
  }
  return <section className="card space-y-3 p-4 sm:p-5">
    <h2 className="flex items-center gap-2 font-semibold"><Timer size={17} className="text-orange" /> Descanso entre séries</h2>
    <div className="flex flex-wrap items-end gap-4">
      <span role="timer" className="text-3xl font-semibold tabular-nums">{elapsedLabel(clock.left ?? (preset || 0))}</span>
      <label className="text-xs text-ink-2">Descanso (segundos)<input type="number" min="1" step="1" value={seconds} disabled={end !== null || busy}
        onChange={e => { setSeconds(e.target.value); update(idle); }} className="input mt-1 block w-24" /></label>
    </div>
    <div className="flex flex-wrap gap-2">{end === null
      ? <button className="btn" disabled={busy || !Number.isInteger(preset) || preset < 1} onClick={start}><Play size={14} />{clock.left ? "Retomar descanso" : "Iniciar descanso"}</button>
      : <button className="btn" onClick={() => update({ end: null, left: Math.max(0, Math.ceil((end - Date.now()) / 1000)) })}><Pause size={14} /> Pausar</button>}
      <button className="btn btn-ghost" disabled={busy || clock.left === null} onClick={() => update(idle)} aria-label="Reiniciar descanso"><RotateCcw size={15} /></button>
    </div>
    {clock.left === 0 && <p role="status" className="text-sm text-green">Descanso concluído.</p>}
    {error && <p role="alert" className="text-sm text-red">{error}</p>}
  </section>;
}
