"use client";

import { Activity, Flame, Gamepad2, ListChecks, Moon, Target } from "lucide-react";
import Link from "next/link";
import { formatPercent, TONE_PILL, TONE_TEXT } from "@/lib/client";
import { scoreTone } from "@/lib/metrics";
import { Tip } from "@/components/ui/Tip";
import type { PerfComponent, PerformanceDTO } from "@/lib/types";

const ICON: Record<PerfComponent["key"], React.ComponentType<{ size?: number; className?: string }>> = {
  tasks: ListChecks,
  sleep: Moon,
  leisure: Gamepad2,
  goals: Target,
};
const LINK: Record<PerfComponent["key"], string> = { tasks: "/quadros", sleep: "/sono", leisure: "/lazer", goals: "/metas" };

function weekdayLetter(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return ["D", "S", "T", "Q", "Q", "S", "S"][new Date(y, m - 1, d).getDay()];
}

/** Card de performance do dia: nota geral 0–100, constância e as quatro frentes que a compõem. */
export function PerformanceCard({ perf, compact = false }: { perf: PerformanceDTO; compact?: boolean }) {
  const score = perf.today.score;
  const tone = scoreTone(score);
  const weightTotal = perf.today.components.filter((c) => c.score !== null).reduce((a, c) => a + c.weight, 0);

  return (
    <section className="performance-panel card p-5">
      {/* Celular: nota em cima e frentes embaixo; a partir de sm: lado a lado. */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <div className="w-full sm:w-[200px] sm:shrink-0">
          <Tip
            text="Média ponderada do dia: tarefas (40%), sono (25%), lazer (15%) e metas (20%). Só entram as frentes com dado no dia; os pesos são redistribuídos entre elas."
            className="cursor-help"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-ink-2 underline decoration-dotted decoration-ink-3/60 underline-offset-4">
              <Activity size={15} className="text-blue" /> Performance
            </div>
            <div className={`mt-1 text-[2.6rem] font-semibold leading-none tracking-tight tabular-nums ${TONE_TEXT[tone]}`}>
              {score === null ? "—" : score}
              {score !== null && <span className="text-xl text-ink-3">/100</span>}
            </div>
          </Tip>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={TONE_PILL[tone]}>{score === null ? "sem dados hoje" : score >= perf.perfTarget ? "na meta" : score >= 50 ? "regular" : "abaixo"}</span>
            <Tip text={`Dias seguidos com performance de ${perf.perfTarget} ou mais (sua meta na aba Metas). Hoje só entra quando já estiver em ${perf.perfTarget}.`} className="cursor-help">
              <span className={`pill ${perf.streak > 0 ? "pill-orange" : ""}`}>
                <Flame size={11} /> constância {perf.streak} {perf.streak === 1 ? "dia" : "dias"}
              </span>
            </Tip>
          </div>

          {!compact && (
            <div className="mt-4">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-3">Últimos 14 dias</div>
              <div className="flex h-12 items-end gap-1">
                {perf.history.map((h) => {
                  const t = scoreTone(h.score);
                  const bar = t === "green" ? "bg-green-deep" : t === "orange" ? "bg-orange-deep" : t === "blue" ? "bg-blue-deep" : "bg-fill-3";
                  return (
                    <div key={h.dayKey} className="flex flex-1 flex-col items-center gap-0.5" title={`${h.dayKey.slice(8)}/${h.dayKey.slice(5, 7)} · ${formatPercent(h.score)}`}>
                      <div className={`w-full rounded-sm ${h.score === null ? "bg-fill-2" : bar}`} style={{ height: `${Math.max(6, (h.score ?? 0) * 0.4)}px` }} />
                      <span className="text-[9px] text-ink-3">{weekdayLetter(h.dayKey)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="w-full min-w-0 flex-1 space-y-2.5">
          {perf.today.components.map((c) => {
            const Icon = ICON[c.key];
            const t = scoreTone(c.score);
            const bar = t === "green" ? "bg-green-deep" : t === "orange" ? "bg-orange-deep" : t === "blue" ? "bg-blue-deep" : "bg-fill-3";
            const share = c.score === null || weightTotal === 0 ? 0 : Math.round((c.weight / weightTotal) * 100);
            return (
              <div key={c.key} className="rounded-xl border border-line bg-well px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <Icon size={14} className="shrink-0 text-ink-3" />
                  <Link href={LINK[c.key]} className="font-medium hover:underline">
                    {c.label}
                  </Link>
                  <span className={`ml-auto shrink-0 text-sm font-semibold tabular-nums ${c.score === null ? "text-ink-3" : TONE_TEXT[t]}`}>
                    {c.score === null ? "—" : c.score}
                  </span>
                  {c.score !== null && <span className="shrink-0 text-[10px] text-ink-3 tabular-nums">peso {share}%</span>}
                  {/* No celular o detalhe desce para a linha de baixo. */}
                  <span className="basis-full truncate text-xs text-ink-3 sm:order-none sm:basis-auto sm:flex-1">{c.detail}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fill-2">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${c.score ?? 0}%` }} />
                </div>
                {c.hint && (
                  <div className="mt-1 text-[11px] text-orange">
                    <Link href={LINK[c.key]} className="hover:underline">
                      {c.hint}
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
