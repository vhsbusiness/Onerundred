"use client";

import { CalendarClock, CheckCircle2, Clock, Gamepad2 } from "lucide-react";
import Link from "next/link";
import { formatPercent, priorityUi, TONE_PILL, TONE_TEXT } from "@/lib/client";
import { scoreTone } from "@/lib/metrics";
import { formatDayLong, formatDuration } from "@/lib/time";
import type { AiStatusDTO, DayReviewDTO } from "@/lib/types";
import { AiInsightCard } from "./AiInsightCard";
import { DayPicker } from "./DayPicker";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
/** Hora do fim; com dia/mês na frente quando a sessão terminou em outro dia. */
function endLabel(endIso: string, startIso: string) {
  const d = new Date(endIso);
  const sameDay = d.toDateString() === new Date(startIso).toDateString();
  return (sameDay ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " ") + timeLabel(endIso);
}

/** Revisão de um dia passado: nota, tarefas feitas, sessões de trabalho e lazer. */
export function DayReview({ data, initialAi }: { data: DayReviewDTO; initialAi?: AiStatusDTO }) {
  const tone = scoreTone(data.score.score);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Revisão do dia</h1>
          <p className="text-sm text-ink-2">{formatDayLong(data.dayKey)}</p>
        </div>
        <DayPicker value={data.dayKey} />
      </div>

      <section className="card p-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
          <div className="min-w-0">
            <div className={`text-[2rem] font-semibold leading-none tracking-tight tabular-nums ${TONE_TEXT[tone]}`}>
              {formatPercent(data.score.score)}
            </div>
            <div className="mt-1.5 text-sm text-ink-2">Nota do dia</div>
            <div className="mt-2">
              <span className={TONE_PILL[tone]}>
                {data.score.doneCount} feitas · {data.score.openCount - data.score.postponedCount} abertas
                {data.score.postponedCount > 0 ? ` · ${data.score.postponedCount} ${data.score.postponedCount === 1 ? "realocada" : "realocadas"}` : ""}
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[2rem] font-semibold leading-none tracking-tight tabular-nums">{data.done.length}</div>
            <div className="mt-1.5 text-sm text-ink-2">Tarefas feitas</div>
            <div className="mt-2">
              <span className="pill">
                {formatDuration(data.done.reduce((acc, c) => acc + c.spentMs, 0))} cronometrados
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[2rem] font-semibold leading-none tracking-tight tabular-nums">{formatDuration(data.workMs)}</div>
            <div className="mt-1.5 text-sm text-ink-2">Trabalhado</div>
            <div className="mt-2">
              <span className="pill">{data.workSessions.length} {data.workSessions.length === 1 ? "sessão" : "sessões"}</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[2rem] font-semibold leading-none tracking-tight tabular-nums">{formatDuration(data.leisureMin * 60000)}</div>
            <div className="mt-1.5 text-sm text-ink-2">Lazer</div>
            <div className="mt-2">
              <Link href="/lazer" className="pill">
                <Gamepad2 size={11} /> ver lazer
              </Link>
            </div>
          </div>
        </div>
      </section>

      <AiInsightCard todayCards={[]} initialStatus={initialAi} dayKey={data.dayKey} />

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="card p-5 lg:col-span-7">
          <h2 className="flex items-center gap-2 text-sm font-medium text-ink-2">
            <CheckCircle2 size={15} className="text-green" /> Tarefas feitas
          </h2>
          {data.done.length === 0 ? (
            <p className="mt-3 text-sm text-ink-3">Nenhuma tarefa concluída neste dia.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {data.done.map((c) => {
                const p = priorityUi(c.priority);
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-well px-3 py-2 text-sm">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${p.dot}`} title={`Prioridade ${p.label}`} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/quadros/${c.boardId}?card=${c.id}`} className="block truncate hover:underline">
                        {c.title}
                      </Link>
                      <div className="truncate text-[11px] text-ink-3">
                        {c.boardName} · {c.listName}
                        {c.archived ? " · arquivada" : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-ink-3 tabular-nums">
                      <div>{timeLabel(c.completedAt)}</div>
                      {c.spentMs > 0 && <div>{formatDuration(c.spentMs)}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-5 lg:col-span-5">
          {data.postponed.length > 0 && (
            <div className="mb-5">
              <h2 className="flex items-center gap-2 text-sm font-medium text-ink-2">
                <CalendarClock size={15} className="text-orange" /> Realocadas
              </h2>
              <p className="mt-1 text-xs text-ink-3">Saíram da lista Hoje sem ser feitas; contam como não feitas no dia.</p>
              <ul className="mt-3 space-y-1.5">
                {data.postponed.map((c) => {
                  const p = priorityUi(c.priority);
                  return (
                    <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-well px-3 py-2 text-sm">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${p.dot}`} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/quadros/${c.boardId}?card=${c.id}`} className="block truncate hover:underline">
                          {c.title}
                        </Link>
                        <div className="truncate text-[11px] text-ink-3">
                          {c.boardName} · agora em {c.listName}
                        </div>
                      </div>
                      <span className="pill pill-orange px-1.5 py-0 text-[10px]">realocada</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <h2 className="flex items-center gap-2 text-sm font-medium text-ink-2">
            <Clock size={15} className="text-blue" /> Sessões de trabalho
          </h2>
          {data.workSessions.length === 0 ? (
            <p className="mt-3 text-sm text-ink-3">Nenhuma sessão começou neste dia.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {data.workSessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg border border-line bg-well px-3 py-1.5 text-sm">
                  <span className="text-ink-2 tabular-nums">
                    {timeLabel(s.startedAt)} – {endLabel(s.endedAt, s.startedAt)}
                  </span>
                  <span className="tabular-nums">{formatDuration(s.ms)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
