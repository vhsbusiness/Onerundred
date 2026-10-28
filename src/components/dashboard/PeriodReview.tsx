"use client";

import { Activity, Flame } from "lucide-react";
import Link from "next/link";
import { formatPercent, TONE_PILL, TONE_TEXT } from "@/lib/client";
import { scoreTone } from "@/lib/metrics";
import { formatDuration, keyToDate, weekdayShort } from "@/lib/time";
import type { PeriodReviewDTO } from "@/lib/types";
import { DayPicker } from "./DayPicker";

function fmt(key: string) {
  return keyToDate(key).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Revisão de um período: performance, nota, feitas, trabalho, lazer e sono por dia. */
export function PeriodReview({ data, days, range }: { data: PeriodReviewDTO; days: number; range?: { from: string; to: string } }) {
  const tone = scoreTone(data.avgScore);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Período</h1>
          <p className="text-sm text-ink-2">
            {fmt(data.startKey)} a {fmt(data.endKey)} · {data.days.length} {data.days.length === 1 ? "dia" : "dias"}
          </p>
        </div>
        <DayPicker value={data.endKey} days={days} range={range} />
      </div>

      <section className="card p-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-6">
          <div className="min-w-0">
            <div className={`flex items-center gap-1 text-[2rem] font-semibold leading-none tracking-tight tabular-nums ${TONE_TEXT[tone]}`}>
              <Activity size={20} className="text-blue" /> {data.avgScore ?? "—"}
            </div>
            <div className="mt-1.5 text-sm text-ink-2">Performance média</div>
            <div className="mt-2">
              <span className={`pill ${data.streak > 0 ? "pill-orange" : ""}`}>
                <Flame size={11} /> constância {data.streak} {data.streak === 1 ? "dia" : "dias"}
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <div className={`text-[2rem] font-semibold leading-none tracking-tight tabular-nums ${TONE_TEXT[scoreTone(data.avgTaskScore)]}`}>{formatPercent(data.avgTaskScore)}</div>
            <div className="mt-1.5 text-sm text-ink-2">Nota média das tarefas</div>
            <div className="mt-2">
              <span className={TONE_PILL[scoreTone(data.avgTaskScore)]}>
                {data.doneTotal} feitas{data.postponedTotal ? ` · ${data.postponedTotal} realocadas` : ""}
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[2rem] font-semibold leading-none tracking-tight tabular-nums">{formatDuration(data.workMsTotal)}</div>
            <div className="mt-1.5 text-sm text-ink-2">Trabalhado</div>
            <div className="mt-2">
              <span className="pill">{formatDuration(Math.round(data.workMsTotal / Math.max(1, data.days.length)))} por dia</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[2rem] font-semibold leading-none tracking-tight tabular-nums">{formatDuration(data.leisureMinTotal * 60000)}</div>
            <div className="mt-1.5 text-sm text-ink-2">Lazer</div>
            <div className="mt-2">
              <span className="pill">{formatDuration(Math.round((data.leisureMinTotal / Math.max(1, data.days.length)) * 60000))} por dia</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[2rem] font-semibold leading-none tracking-tight tabular-nums">{data.avgSleepMin === null ? "—" : formatDuration(data.avgSleepMin * 60000)}</div>
            <div className="mt-1.5 text-sm text-ink-2">Sono médio</div>
            <div className="mt-2">
              <span className="pill">{data.days.filter((d) => d.sleepMin !== null).length} noites registradas</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-medium text-ink-2">Dia a dia</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-ink-3">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Dia</th>
                <th className="py-1.5 pr-3 font-medium">Performance</th>
                <th className="py-1.5 pr-3 font-medium">Tarefas</th>
                <th className="py-1.5 pr-3 font-medium">Feitas</th>
                <th className="py-1.5 pr-3 font-medium">Trabalho</th>
                <th className="py-1.5 pr-3 font-medium">Lazer</th>
                <th className="py-1.5 pr-3 font-medium">Sono</th>
                <th className="py-1.5 font-medium">Metas</th>
              </tr>
            </thead>
            <tbody>
              {data.days
                .slice()
                .reverse()
                .map((d) => {
                  const t = scoreTone(d.score);
                  const goals = d.components.find((c) => c.key === "goals");
                  return (
                    <tr key={d.dayKey} className="border-t border-line">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <Link href={`/?dia=${d.dayKey}`} className="hover:underline">
                          <span className="text-ink-3">{weekdayShort(d.dayKey)}</span> {fmt(d.dayKey)}
                        </Link>
                      </td>
                      <td className={`py-2 pr-3 font-semibold tabular-nums ${TONE_TEXT[t]}`}>{d.score ?? "—"}</td>
                      <td className={`py-2 pr-3 tabular-nums ${TONE_TEXT[scoreTone(d.taskScore.score)]}`}>{formatPercent(d.taskScore.score)}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {d.doneCount}
                        {d.postponedCount ? <span className="text-orange"> · {d.postponedCount} realoc.</span> : null}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{d.workMs ? formatDuration(d.workMs) : "—"}</td>
                      <td className="py-2 pr-3 tabular-nums">{d.leisureMin ? formatDuration(d.leisureMin * 60000) : "—"}</td>
                      <td className="py-2 pr-3 tabular-nums">{d.sleepMin === null ? "—" : formatDuration(d.sleepMin * 60000)}</td>
                      <td className="py-2 tabular-nums">{goals?.score === null || goals?.score === undefined ? "—" : `${goals.score}%`}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-3">Clique num dia para abrir a revisão dele.</p>
      </section>
    </div>
  );
}
