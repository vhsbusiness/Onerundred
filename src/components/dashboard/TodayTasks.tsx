"use client";

import { Check, Pause, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { isOverdue } from "@/lib/metrics";
import { elapsedSince, http, priorityUi, useNow } from "@/lib/client";
import { formatDuration, minutesToLabel } from "@/lib/time";
import type { CardDTO, TodayCard } from "@/lib/types";

export function TodayTasks({
  cards,
  todayKey,
  onChanged,
}: {
  cards: TodayCard[];
  todayKey: string;
  onChanged: () => void;
}) {
  const anyRunning = cards.some((c) => c.runningSince);
  const now = useNow(anyRunning);

  async function timer(card: CardDTO) {
    await http.post(`/api/cards/${card.id}/timer`, { action: card.runningSince ? "stop" : "start" });
    onChanged();
  }

  async function toggleDone(card: CardDTO) {
    await http.patch(`/api/cards/${card.id}`, { completed: !card.completedAt });
    onChanged();
  }

  if (cards.length === 0) {
    return (
      <p className="text-sm text-ink-3">
        Nenhuma tarefa para hoje. Crie tarefas nos seus{" "}
        <Link href="/quadros" className="text-ink underline-offset-2 hover:underline">
          quadros
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {cards.map((c) => {
        const p = priorityUi(c.priority);
        const done = Boolean(c.completedAt);
        const running = Boolean(c.runningSince);
        const spent = c.spentMs + (running ? elapsedSince(c.runningSince, now) : 0);
        const overdue = isOverdue(c, todayKey);
        return (
          <li
            key={c.id}
            className={`group flex items-center gap-3 rounded-xl border border-line px-3 py-2 transition ${
              running ? "bg-green/[0.06] border-green/30" : "bg-well hover:bg-fill"
            } ${done ? "opacity-55" : ""}`}
          >
            <button
              type="button"
              onClick={() => toggleDone(c)}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                done ? "border-green bg-green text-bg" : "border-line-2 hover:border-ink-2"
              }`}
              aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
              title={done ? "Reabrir" : "Concluir"}
            >
              {done ? <Check size={13} strokeWidth={3} /> : null}
            </button>

            <span className={`h-2 w-2 shrink-0 rounded-full ${p.dot}`} title={`Prioridade ${p.label}`} />

            <div className="min-w-0 flex-1">
              <Link
                href={`/quadros/${c.boardId}?card=${c.id}`}
                className={`block truncate text-sm ${done ? "line-through" : ""}`}
              >
                {c.title}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
                <span>{c.listName}</span>
                {c.estimatedMinutes ? <span>· est. {minutesToLabel(c.estimatedMinutes)}</span> : null}
                {spent > 0 ? (
                  <span className={running ? "text-green" : ""}>· {formatDuration(spent)}</span>
                ) : null}
                {overdue ? <span className="text-red">· atrasada</span> : null}
              </div>
            </div>

            {!done && (
              <button
                type="button"
                onClick={() => timer(c)}
                className={`btn h-8 w-8 shrink-0 p-0 ${running ? "pill-green border-green/40" : "md:opacity-0 md:group-hover:opacity-100"}`}
                aria-label={running ? "Pausar cronômetro" : "Iniciar cronômetro"}
                title={running ? "Pausar" : "Iniciar"}
              >
                {running ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
              </button>
            )}
            {done && (
              <button
                type="button"
                onClick={() => toggleDone(c)}
                className="btn h-8 w-8 shrink-0 p-0 md:opacity-0 md:group-hover:opacity-100"
                aria-label="Reabrir"
                title="Reabrir"
              >
                <RotateCcw size={14} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
