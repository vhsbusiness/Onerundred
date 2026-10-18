"use client";

import { Pause, Play, Trash2 } from "lucide-react";
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

  async function toggle() {
    setBusy(true);
    try {
      const next = await http.post<WorkState>("/api/work", { action: running ? "stop" : "start" });
      onChange(next);
      notifyWorkChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Apagar esta sessão de trabalho?")) return;
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

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[2.6rem] font-semibold leading-none tracking-tight tabular-nums">
            {formatClock(totalMs)}
          </div>
          <div className="mt-2 text-sm text-ink-2">
            {running ? (
              <span className="inline-flex items-center gap-2">
                <span className="live-dot h-2 w-2 rounded-full bg-green" />
                Trabalhando desde {timeLabel(work.running!.startedAt)}
              </span>
            ) : (
              <>Trabalhado hoje</>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={`btn h-14 w-14 rounded-full p-0 ${running ? "pill-red border-red/40" : "btn-primary"}`}
          aria-label={running ? "Parar de trabalhar" : "Começar a trabalhar"}
          title={running ? "Parar de trabalhar" : "Começar a trabalhar"}
        >
          {running ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
        </button>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs text-ink-2">
          <span>Meta de hoje</span>
          <span className="tabular-nums">
            {formatDuration(totalMs)} / {formatDuration(plannedMs)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
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
                  className="group flex items-center justify-between rounded-lg border border-line bg-black/20 px-3 py-1.5 text-sm"
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
                        className="text-ink-3 opacity-0 transition hover:text-red group-hover:opacity-100"
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
