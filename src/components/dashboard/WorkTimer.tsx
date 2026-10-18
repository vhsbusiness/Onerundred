"use client";

import { askConfirm } from "@/components/ui/ConfirmProvider";
import { Pause, Play, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { elapsedSince, http, notifyWorkChanged, TONE_BAR, TONE_PILL, useNow } from "@/lib/client";
import { formatClock, formatDuration } from "@/lib/time";
import type { WorkState } from "@/lib/types";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function WorkTimer({ work, onChange }: { work: WorkState; onChange: (w: WorkState) => void }) {
  const [busy, setBusy] = useState(false);
  const running = Boolean(work.running);
  const now = useNow(running);
  // Soma as sessões encerradas e, se houver uma em andamento, o tempo desde o início dela.
  const closedMs = work.sessions
    .filter((s) => s.endedAt)
    .reduce((acc, s) => acc + (new Date(s.endedAt!).getTime() - new Date(s.startedAt).getTime()), 0);
  const totalMs = closedMs + (running ? elapsedSince(work.running!.startedAt, now) : 0);

  const plannedMs = work.plannedMinutes * 60000;
  const progress = plannedMs > 0 ? Math.min(1, totalMs / plannedMs) : 0;

  async function act(action: "start" | "pause" | "end") {
    if (action === "end" && !(await askConfirm({ title: "Encerrar o dia", message: "Encerrar o dia de trabalho? Você ainda pode reabrir depois.", confirmLabel: "Encerrar" }))) return;
    setBusy(true);
    try {
      const next = await http.post<WorkState>("/api/work", { action });
      onChange(next);
      notifyWorkChanged();
    } finally {
      setBusy(false);
    }
  }

  const hasSessions = work.sessions.length > 0;
  const paused = !running && hasSessions && !work.ended;
  const lastEnd = work.sessions.find((s) => s.endedAt)?.endedAt ?? null;

  async function remove(id: string) {
    if (!(await askConfirm({ title: "Apagar sessão", message: "Apagar esta sessão de trabalho?", confirmLabel: "Apagar", danger: true }))) return;
    const next = await http.del<WorkState>(`/api/work/${id}`);
    onChange(next);
    notifyWorkChanged();
  }

  return (
    <section
      className="card blob-surface flex h-full flex-col p-5"
      style={
        {
          "--blob-a": running ? "rgba(139,227,166,0.55)" : "rgba(245,176,110,0.45)",
          "--blob-b": "rgba(127,183,245,0.45)",
        } as React.CSSProperties
      }
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink-2">Sessão de trabalho</h2>
        <span className={TONE_PILL[work.verdict.tone]}>{work.verdict.label}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[2.1rem] font-semibold leading-none tracking-tight tabular-nums sm:text-[2.6rem]">
            {formatClock(totalMs)}
          </div>
          <div className="mt-2 text-sm text-ink-2">
            {running ? (
              <span className="inline-flex items-center gap-2">
                <span className="live-dot h-2 w-2 rounded-full bg-green" />
                Trabalhando desde {timeLabel(work.running!.startedAt)}
              </span>
            ) : work.ended ? (
              <>Dia encerrado{lastEnd ? ` às ${timeLabel(lastEnd)}` : ""}</>
            ) : paused ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-orange" />
                Pausado{lastEnd ? ` às ${timeLabel(lastEnd)}` : ""}
              </span>
            ) : (
              <>Trabalhado hoje</>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <>
              <button
                type="button"
                onClick={() => act("pause")}
                disabled={busy}
                className="btn h-12 rounded-full pill-orange border-orange/40 px-4"
                title="Pausar (o dia continua aberto)"
              >
                <Pause size={16} /> Pausar
              </button>
              <button
                type="button"
                onClick={() => act("end")}
                disabled={busy}
                className="btn h-12 w-12 rounded-full p-0 pill-red border-red/40"
                aria-label="Encerrar o dia"
                title="Encerrar o dia"
              >
                <Square size={16} />
              </button>
            </>
          ) : work.ended ? (
            <button type="button" onClick={() => act("start")} disabled={busy} className="btn h-12 rounded-full px-4">
              <Play size={16} className="ml-0.5" /> Reabrir
            </button>
          ) : paused ? (
            <>
              <button type="button" onClick={() => act("start")} disabled={busy} className="btn btn-primary h-12 rounded-full px-4">
                <Play size={16} className="ml-0.5" /> Retomar
              </button>
              <button
                type="button"
                onClick={() => act("end")}
                disabled={busy}
                className="btn h-12 w-12 rounded-full p-0 pill-red border-red/40"
                aria-label="Encerrar o dia"
                title="Encerrar o dia"
              >
                <Square size={16} />
              </button>
            </>
          ) : (
            <button type="button" onClick={() => act("start")} disabled={busy} className="btn btn-primary h-12 rounded-full px-4">
              <Play size={16} className="ml-0.5" /> Começar
            </button>
          )}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs text-ink-2">
          <span>Meta de hoje</span>
          <span className="tabular-nums">
            {formatDuration(totalMs)} / {formatDuration(plannedMs)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-fill-2">
          <div
            className={`h-full rounded-full ${TONE_BAR[work.verdict.tone]} transition-[width] duration-700`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-5 flex-1">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Sessões de hoje</h3>
        {work.sessions.length === 0 ? (
          <p className="text-sm text-ink-3">Nenhuma sessão ainda. Aperte o botão para começar.</p>
        ) : (
          <ul className="space-y-1.5">
            {work.sessions.slice(0, 6).map((s) => {
              const ms = s.endedAt
                ? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()
                : elapsedSince(s.startedAt, now);
              return (
                <li
                  key={s.id}
                  className="group flex items-center justify-between rounded-lg border border-line bg-well px-3 py-1.5 text-sm"
                >
                  <span className="text-ink-2 tabular-nums">
                    {timeLabel(s.startedAt)} – {s.endedAt ? timeLabel(s.endedAt) : "agora"}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{formatDuration(ms)}</span>
                    {s.endedAt && (
                      <button
                        type="button"
                        onClick={() => remove(s.id)}
                        className="text-ink-3 md:opacity-0 transition hover:text-red md:group-hover:opacity-100"
                        aria-label="Apagar sessão"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
