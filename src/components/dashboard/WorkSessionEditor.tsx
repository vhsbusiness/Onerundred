"use client";

import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { DateField } from "@/components/ui/DateField";
import { Modal } from "@/components/ui/Modal";
import { TimeField } from "@/components/ui/TimeField";
import { notify } from "@/components/ui/ConfirmProvider";
import { http, notifyWorkChanged } from "@/lib/client";
import { dayKey, formatDuration, todayKey } from "@/lib/time";
import type { WorkState } from "@/lib/types";

type ClosedSession = { id: string; startedAt: string; endedAt: string };

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Campos sem mudança preservam os segundos do registro original.
function timestamp(day: string, time: string, original: string) {
  if (day === dayKey(new Date(original)) && time === clock(original)) return new Date(original);
  return new Date(`${day}T${time}:00`);
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = timestamp(startDay, startTime, session.startedAt);
  const end = timestamp(endDay, endTime, session.endedAt);
  const duration = end.getTime() - start.getTime();
  const valid = Number.isFinite(duration) && duration > 0;
  const changed = start.getTime() !== new Date(session.startedAt).getTime() || end.getTime() !== new Date(session.endedAt).getTime();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !valid || !changed) return;
    setBusy(true);
    setError(null);
    try {
      const work = await http.patch<WorkState>(`/api/work/${session.id}`, {
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
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
        </fieldset>
        <div className="rounded-xl border border-line bg-well p-3">
          {valid ? <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-ink-2">Duração corrigida</span>
            <strong className="tabular-nums">{formatDuration(duration)}</strong>
          </div> : <p className="text-sm text-red">O término deve ser depois do início. Confira também as datas.</p>}
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
