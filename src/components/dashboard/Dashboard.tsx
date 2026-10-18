"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatPercent, http, TONE_PILL, TONE_TEXT } from "@/lib/client";
import { scoreTone, type PeriodScore } from "@/lib/metrics";
import { formatDayLong, formatDuration } from "@/lib/time";
import type { AiStatusDTO, DashboardDTO, WorkState } from "@/lib/types";
import { AiInsightCard } from "./AiInsightCard";
import { HistoryChart } from "./HistoryChart";
import { TodayTasks } from "./TodayTasks";
import { WorkTimer } from "./WorkTimer";

function ScoreTile({ label, score, hint, help }: { label: string; score: PeriodScore; hint: string; help: string }) {
  const tone = scoreTone(score.score);
  return (
    <div className="min-w-0 cursor-help" title={help}>
      <div className={`text-[2rem] font-semibold leading-none tracking-tight tabular-nums ${TONE_TEXT[tone]}`}>
        {formatPercent(score.score)}
      </div>
      <div className="mt-1.5 text-sm text-ink-2 underline decoration-dotted decoration-ink-3/60 underline-offset-4">{label}</div>
      <div className="mt-2">
        <span className={TONE_PILL[tone]}>{hint}</span>
      </div>
    </div>
  );
}

function PlainTile({
  value,
  label,
  pill,
  pillClass = "pill",
  help,
}: {
  value: string;
  label: string;
  pill: string;
  pillClass?: string;
  help?: string;
}) {
  return (
    <div className={`min-w-0 ${help ? "cursor-help" : ""}`} title={help}>
      <div className="text-[2rem] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
      <div className={`mt-1.5 text-sm text-ink-2 ${help ? "underline decoration-dotted decoration-ink-3/60 underline-offset-4" : ""}`}>{label}</div>
      <div className="mt-2">
        <span className={pillClass}>{pill}</span>
      </div>
    </div>
  );
}

function SegmentedBar({ counts }: { counts: DashboardDTO["counts"] }) {
  const total = counts.done + counts.inProgress + counts.pending;
  const segs = [
    { key: "done", label: "Feitas", n: counts.done, cls: "bg-green-deep" },
    { key: "prog", label: "Em andamento", n: counts.inProgress, cls: "bg-orange-deep" },
    { key: "pend", label: "Pendentes", n: counts.pending, cls: "bg-blue-deep" },
  ];
  return (
    <div>
      <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-lg">
        {total === 0 ? (
          <div className="h-full w-full rounded-lg bg-white/[0.05]" />
        ) : (
          segs
            .filter((s) => s.n > 0)
            .map((s) => (
              <div
                key={s.key}
                className={`${s.cls} h-full rounded-[4px] transition-[width] duration-500`}
                style={{ width: `${(s.n / total) * 100}%` }}
                title={`${s.label}: ${s.n}`}
              />
            ))
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {segs.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-sm ${s.cls}`} />
            {s.label} <span className="text-ink tabular-nums">{s.n}</span>
          </span>
        ))}
        {counts.overdue > 0 && (
          <span className="inline-flex items-center gap-1.5 text-red">
            <span className="h-2 w-2 rounded-sm bg-red" />
            Atrasadas <span className="tabular-nums">{counts.overdue}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export function Dashboard({ initialData, initialAi }: { initialData?: DashboardDTO; initialAi?: AiStatusDTO }) {
  const [data, setData] = useState<DashboardDTO | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await http.get<DashboardDTO>("/api/dashboard"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    // Sem dados iniciais do servidor, busca ao montar (o setState ocorre após o await).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initialData) load();
    const id = setInterval(load, 60000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, initialData]);

  if (error) {
    return (
      <div className="card p-6 text-sm text-red">
        {error}{" "}
        <button type="button" className="btn ml-2" onClick={load}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid animate-pulse gap-4 lg:grid-cols-12">
        <div className="card h-56 lg:col-span-8" />
        <div className="card h-56 lg:col-span-4" />
        <div className="card h-72 lg:col-span-5" />
        <div className="card h-72 lg:col-span-7" />
      </div>
    );
  }

  const onWork = (w: WorkState) => setData((d) => (d ? { ...d, work: w } : d));
  const todayHint = `${data.today.doneCount} feitas · ${data.today.openCount} abertas`;
  const weekHint = `${data.week.doneCount} feitas · ${data.week.openCount} abertas`;
  const monthHint = `${data.month.doneCount} feitas · ${data.month.openCount} abertas`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Seu dia</h1>
          <p className="text-sm text-ink-2">{formatDayLong(data.todayKey)}</p>
        </div>
        {data.runningTask && (
          <Link
            href={`/quadros/${data.runningTask.boardId}?card=${data.runningTask.cardId}`}
            className="pill pill-green"
            title="Tarefa em andamento"
          >
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-green" />
            Fazendo: {data.runningTask.title}
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="card p-5 lg:col-span-8">
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-5">
            <ScoreTile
              label="Hoje"
              score={data.today}
              hint={todayHint}
              help="Nota de hoje: peso das tarefas concluídas hoje dividido pelo peso das concluídas mais as que ainda estão abertas (agendadas até hoje). Peso = prioridade da tarefa (Alta 3, Média 2, Baixa 1) × prioridade da lista (Alta ×1,5, Média ×1, Baixa ×0,5). Tarefas de amanhã não entram."
            />
            <ScoreTile
              label="Esta semana"
              score={data.week}
              hint={weekHint}
              help="Nota da semana (segunda a domingo): peso das tarefas concluídas na semana dividido pelo peso das concluídas mais as que continuam abertas no fim da semana."
            />
            <ScoreTile
              label="Este mês"
              score={data.month}
              hint={monthHint}
              help="Nota do mês: peso das tarefas concluídas no mês dividido pelo peso das concluídas mais as que continuam abertas no fim do mês."
            />
            <PlainTile
              value={formatDuration(data.work.todayMs)}
              label="Trabalhado hoje"
              pill={data.work.verdict.label}
              pillClass={TONE_PILL[data.work.verdict.tone]}
              help="Soma das sessões de trabalho de hoje (botão começar/pausar). O selo compara esse tempo com a soma das estimativas das tarefas de hoje ou, se não houver estimativas, com a sua meta diária das Configurações."
            />
            <PlainTile
              value={`${data.streak}d`}
              label="Sequência ≥ 70%"
              pill={data.streak > 0 ? "Mantenha o ritmo" : "Comece hoje"}
              pillClass={data.streak > 0 ? "pill pill-orange" : "pill"}
              help="Quantos dias seguidos você fechou com nota de 70% ou mais. Dias sem nenhuma tarefa não quebram a sequência; hoje conta se já estiver em 70% ou mais."
            />
          </div>

          <div className="mt-6">
            <AiInsightCard todayCards={data.todayCards} initialStatus={initialAi} />
          </div>

          <div className="mt-5">
            <SegmentedBar counts={data.counts} />
          </div>
        </section>

        <div className="lg:col-span-4">
          <WorkTimer work={data.work} onChange={onWork} />
        </div>

        <section className="card p-5 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-2">Últimos 14 dias</h2>
            <span className="pill">nota diária</span>
          </div>
          <HistoryChart history={data.history} todayKey={data.todayKey} />
        </section>

        <section className="card p-5 lg:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-2">Tarefas de hoje</h2>
            <Link href="/quadros" className="btn btn-ghost h-8 px-3 text-xs">
              Ver quadros
            </Link>
          </div>
          <TodayTasks cards={data.todayCards} todayKey={data.todayKey} onChanged={load} />
        </section>
      </div>
    </div>
  );
}
