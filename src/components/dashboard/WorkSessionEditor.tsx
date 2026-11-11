"use client";

import { useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { breakError, sortedBreaks } from "@/lib/work-breaks";
import { createPortal } from "react-dom";
import { DateField } from "@/components/ui/DateField";
import { Modal } from "@/components/ui/Modal";
import { TimeField } from "@/components/ui/TimeField";
import { notify } from "@/components/ui/ConfirmProvider";
import { http, notifyWorkChanged } from "@/lib/client";
import { dayKey, formatDuration, todayKey } from "@/lib/time";
import type { WorkBreak, WorkState } from "@/lib/types";

type ClosedSession = { id: string; startedAt: string; endedAt: string; breaks: WorkBreak[] };

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Campos sem mudança preservam os segundos do registro original.
function timestamp(day: string, time: string, original: string) {
  if (day === dayKey(new Date(original)) && time === clock(original)) return new Date(original);
  return new Date(`${day}T${time}:00`);
}

type BreakDraft = { key: number; startDay: string; startTime: string; endDay: string; endTime: string; original?: WorkBreak };

function breakISO(day: string, time: string, original?: string) {
  if (!day || !time) return "";
  const date = original ? timestamp(day, time, original) : new Date(`${day}T${time}:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

export function WorkSessionEditor({ session, onClose, onSaved }: {
  session: ClosedSession;
  onClose: () => void;
  onSaved: (work: WorkState) => void;
}) {
  const [startDay, setStartDay] = useState(() => dayKey(new Date(session.startedAt)));
  const [startTime, setStartTime] = useState(() => clock(session.startedAt));
  const [endDay, setEndDay] = useState(() => dayKey(new Date(session.endedAt)));
  const [endTime, setEndTime] = useState(() => clock(session.endedAt));
  const [drafts, setDrafts] = useState<BreakDraft[]>(() => session.breaks.map((pause, key) => ({
    key, original: pause,
    startDay: dayKey(new Date(pause.startedAt)), startTime: clock(pause.startedAt),
    endDay: dayKey(new Date(pause.endedAt)), endTime: clock(pause.endedAt),
  })));
  const nextKey = useRef(drafts.length);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = timestamp(startDay, startTime, session.startedAt);
  const end = timestamp(endDay, endTime, session.endedAt);
  const duration = end.getTime() - start.getTime();
  const breaks = sortedBreaks(drafts.map(draft => ({
    startedAt: breakISO(draft.startDay, draft.startTime, draft.original?.startedAt),
    endedAt: breakISO(draft.endDay, draft.endTime, draft.original?.endedAt),
  })));
  const invalid = Number.isFinite(duration) && duration > 0 ? breakError(breaks, start, end)
    : "O término deve ser depois do início. Confira também as datas.";
  const valid = invalid === null;
  const pausedMs = valid ? breaks.reduce((sum, pause) => sum + (Date.parse(pause.endedAt) - Date.parse(pause.startedAt)), 0) : 0;
  const changed = start.getTime() !== new Date(session.startedAt).getTime() || end.getTime() !== new Date(session.endedAt).getTime()
    || JSON.stringify(breaks) !== JSON.stringify(session.breaks);

  function changeBreak(key: number, change: Partial<Omit<BreakDraft, "key" | "original">>) {
    setDrafts(current => current.map(draft => draft.key === key ? { ...draft, ...change } : draft));
  }

  function addBreak() {
    const key = nextKey.current++;
    setDrafts(current => [...current, { key, startDay, endDay: startDay, startTime: "", endTime: "" }]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !valid || !changed) return;
    setBusy(true);
    setError(null);
    try {
      const work = await http.patch<WorkState>(`/api/work/${session.id}`, {
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        breaks, previousBreaks: session.breaks,
        previousStartedAt: session.startedAt,
        previousEndedAt: session.endedAt,
      });
      onSaved(work);
      notifyWorkChanged();
      notify("Sessão corrigida. Atualize a análise do dia para a IA considerar os novos horários.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a sessão.");
    } finally {
      setBusy(false);
    }
  }

  // Montado apenas ao clicar em editar; fora dos painéis com backdrop-filter.
  return createPortal(
    <Modal open onClose={() => { if (!busy) onClose(); }} title={<h2 className="text-lg font-semibold">Editar sessão de trabalho</h2>}>
      <form onSubmit={save} className="space-y-5">
        <p className="text-sm text-ink-2">Informe quando você realmente começou e parou de trabalhar.</p>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-medium">Início</h3>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] gap-3">
              <DateField value={startDay} onChange={setStartDay} max={todayKey()} ariaLabel="Dia de início" />
              <TimeField value={startTime} onChange={setStartTime} ariaLabel="Horário de início" />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Término</h3>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] gap-3">
              <DateField value={endDay} onChange={setEndDay} min={startDay} max={todayKey()} ariaLabel="Dia de término" />
              <TimeField value={endTime} onChange={setEndTime} ariaLabel="Horário de término" />
            </div>
          </div>
          {drafts.map((draft, index) => (
            <section key={draft.key} className="space-y-3 rounded-xl border border-line bg-well p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Pausa {index + 1}</h3>
                <button type="button" onClick={() => setDrafts(current => current.filter(item => item.key !== draft.key))}
                  aria-label={`Remover pausa ${index + 1}`} title="Remover pausa" className="btn btn-ghost h-8 w-8 p-0 text-ink-3 hover:text-red">
                  <Trash2 size={14} />
                </button>
              </div>
              <div>
                <div className="mb-1 text-xs text-ink-2">Início da pausa</div>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] gap-3">
                  <DateField value={draft.startDay} min={startDay} max={endDay} ariaLabel={`Dia de início da pausa ${index + 1}`}
                    onChange={day => changeBreak(draft.key, { startDay: day, endDay: day > draft.endDay ? day : draft.endDay })} />
                  <TimeField liveInput value={draft.startTime} ariaLabel={`Horário de início da pausa ${index + 1}`}
                    onChange={time => changeBreak(draft.key, { startTime: time })} />
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs text-ink-2">Fim da pausa</div>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] gap-3">
                  <DateField value={draft.endDay} min={draft.startDay} max={endDay} ariaLabel={`Dia de fim da pausa ${index + 1}`}
                    onChange={day => changeBreak(draft.key, { endDay: day })} />
                  <TimeField liveInput value={draft.endTime} ariaLabel={`Horário de fim da pausa ${index + 1}`}
                    onChange={time => changeBreak(draft.key, { endTime: time })} />
                </div>
              </div>
            </section>
          ))}
          <button className="btn" type="button" onClick={addBreak}><Plus size={14} /> Adicionar pausa</button>
        </fieldset>
        <div className="rounded-xl border border-line bg-well p-3">
          {valid ? <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-ink-2">Tempo trabalhado</span>
            <strong className="tabular-nums">{formatDuration(duration - pausedMs)}</strong>
          </div> : <p className="text-sm text-red">{invalid}</p>}
          {valid && breaks.length > 0 && <div className="mt-1 text-xs text-ink-2">Tempo em pausa · {formatDuration(pausedMs)}</div>}
          <p className="mt-2 text-xs text-ink-3">O tempo é contabilizado no dia de início, mesmo quando termina no dia seguinte.</p>
        </div>
        {error && <p role="alert" className="text-sm text-red">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn">Cancelar</button>
          <button type="submit" disabled={busy || !valid || !changed} className="btn btn-primary">
            {busy ? "Salvando…" : "Salvar horários"}
          </button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
