import Link from "next/link";
import { useRouter } from "next/navigation";
import { notify } from "@/components/ui/ConfirmProvider";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { http } from "@/lib/client";
import { elapsedLabel } from "@/lib/training-types";

type ClockState = { end: number | null; left: number | null };
const idle: ClockState = { end: null, left: null };

function remember(key: string, state: ClockState) {
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* O contador funciona mesmo sem armazenamento local. */ }
}
export function RestTimer({ projectId, initialSeconds, initialEnd }: { projectId: string; initialSeconds: number; initialEnd: number | null }) {
  const router = useRouter();
  const initial = useRef(initialEnd);
  const lastAlert = useRef<number | null>(null);
  const key = "training-rest:" + projectId;
  const [seconds, setSeconds] = useState(String(initialSeconds));
  const url = "/api/treinos/" + projectId + "/descanso";
  const [clock, setClock] = useState<ClockState>(idle);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const preset = Number(seconds);
  const end = clock.end;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      const value = initial.current !== null ? { end: initial.current } : raw ? JSON.parse(raw) : {};

      if (typeof value.end === "number" && Number.isFinite(value.end)) {
        const left = Math.max(0, Math.ceil((value.end - Date.now()) / 1000));
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
      if (!left) {
        remember(key, state);
        if (lastAlert.current !== end && document.visibilityState === "visible") {
          lastAlert.current = end;
          notify("Descanso concluído. Hora da próxima série.");
        }
      }
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
      const left = clock.left || preset;
      const result = await http.put<{end: number}>(url, { seconds: left, preset });
      update({ end: result.end, left });
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar o descanso."); }
    finally { setBusy(false); }
  }
  async function stop(reset: boolean) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (end !== null) await http.put(url, { cancelEnd: end });
      update(reset ? idle : { end: null, left: Math.max(0, Math.ceil(((end ?? Date.now()) - Date.now()) / 1000)) });
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao alterar o descanso."); }
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
      : <button className="btn" disabled={busy} onClick={() => stop(false)}><Pause size={14} /> Pausar</button>}
      <button className="btn btn-ghost" disabled={busy || clock.left === null} onClick={() => stop(true)} aria-label="Reiniciar descanso"><RotateCcw size={15} /></button>
    </div>
    {clock.left === 0 && <p role="status" className="text-sm text-green">Descanso concluído.</p>}
    <Link href="/perfil#notificacoes" className="inline-block text-xs text-ink-2 underline">Configurar notificações de descanso</Link>
    {error && <p role="alert" className="text-sm text-red">{error}</p>}
  </section>;
}
