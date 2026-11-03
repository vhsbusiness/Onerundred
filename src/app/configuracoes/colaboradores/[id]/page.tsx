import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserPage } from "@/lib/current-user";
import { dayKey, dayRange, formatDayLong, formatDuration, keyToDate, todayKey } from "@/lib/time";
import { getPeriodReview } from "@/lib/performance";
import { ReportDate } from "@/components/settings/ReportDate";
import type { AiInsightContent } from "@/lib/types";

const time = (value: Date) => value.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dateTime = (value: Date) => value.toLocaleDateString("pt-BR") + " às " + time(value);

function Entries({ title, items }: { title: string; items: string[] }) {
  return <section className="card min-w-0 p-5">
    <h2 className="font-semibold">{title}</h2>
    {items.length ? <ul className="mt-3 divide-y divide-line text-sm text-ink-2">
      {items.map((item, index) => <li key={index} className="break-words py-2">{item}</li>)}
    </ul> : <p className="mt-2 text-sm text-ink-3">Sem registros neste dia.</p>}
  </section>;
}

export default async function Report({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ dia?: string }> }) {
  const manager = await requireUserPage();
  const { id } = await params;
  const link = await prisma.collaboration.findFirst({
    where: { id, managerId: manager.id, accepted: true, employee: { active: true } },
    select: { employeeId: true, employee: { select: { name: true, username: true } } },
  });
  if (!link) notFound();
  const userId = link.employeeId;
  const today = todayKey();
  const { dia = today } = await searchParams;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || dayKey(keyToDate(dia)) !== dia || dia > today) notFound();
  const { start, end } = dayRange(dia);
  const dateFilter = { gte: start, lt: end };
  const [period, sessions, tasks, sleep, leisure, goals, reminders, insight] = await Promise.all([
    getPeriodReview(userId, dia, 7),
    prisma.workSession.findMany({ where: { userId, startedAt: dateFilter }, orderBy: { startedAt: "asc" }, select: { startedAt: true, endedAt: true } }),
    prisma.card.findMany({ where: {
      list: { board: { userId, type: "tasks" } },
      OR: [{ scheduledFor: dia }, { completedAt: dateFilter }, { sessions: { some: { startedAt: dateFilter } } }],
    }, select: { title: true, completedAt: true, list: { select: { name: true } }, sessions: { where: { startedAt: dateFilter }, select: { startedAt: true, endedAt: true } } }, orderBy: { title: "asc" } }),
    prisma.sleepLog.findUnique({ where: { userId_dayKey: { userId, dayKey: dia } }, select: { bedAt: true, sleepAt: true, wakeAt: true, quality: true, note: true } }),
    prisma.leisureLog.findMany({ where: { userId, dayKey: dia }, select: { activity: true, startAt: true, endAt: true, note: true } }),
    prisma.projectDay.findMany({ where: { project: { userId }, dayKey: dia }, select: { done: true, note: true, project: { select: { name: true } } } }),
    prisma.reminder.findMany({ where: { userId, OR: [{ at: dateFilter }, { lastSentAt: dateFilter }] }, select: { at: true, lastSentAt: true, title: true, note: true } }),
    prisma.aiInsight.findFirst({ where: { userId, dayKey: dia }, orderBy: { createdAt: "desc" }, select: { content: true } }),
  ]);
  const selected = period.days[period.days.length - 1];
  const ai: AiInsightContent | null = insight ? JSON.parse(insight.content) : null;
  return <main className="space-y-4">
    <Link href="/configuracoes/colaboradores" className="text-sm text-blue">← Colaboradores</Link>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">{link.employee.name}</h1>
        <p className="text-sm text-ink-2">@{link.employee.username} · Relatório de atividade · {formatDayLong(dia)}</p></div>
      <ReportDate value={dia} max={today} />
    </header>
    <section className="card p-5">
      <h2 className="font-semibold">Performance do dia · {selected.score === null ? "sem dados" : selected.score + "/100"}</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{selected.components.map(part => <div key={part.key} className="rounded-xl bg-well p-3">
        <div className="text-sm">{part.label} · {part.score ?? "—"}</div><p className="text-xs text-ink-3">{part.detail}</p></div>)}</div>
      <h3 className="mt-4 text-sm font-semibold">Últimos sete dias</h3>
      <div className="mt-2 flex flex-wrap gap-2">{period.days.map(d => <Link key={d.dayKey} prefetch={false} href={`?dia=${d.dayKey}`} className="btn text-xs">{d.dayKey.slice(8)}/{d.dayKey.slice(5,7)} · {d.score ?? "—"}/100</Link>)}</div>
    </section>
    <div className="grid gap-4 md:grid-cols-2">
      <Entries title={`Trabalho · ${formatDuration(selected.workMs)}`} items={sessions.map(s => `${dateTime(s.startedAt)} até ${s.endedAt ? dateTime(s.endedAt) : "agora"}`)} />
      <Entries title="Tarefas dos quadros próprios" items={tasks.map(t => {
        const spent = t.sessions.reduce((sum,s) => sum + (s.endedAt?.getTime() ?? Date.now()) - s.startedAt.getTime(), 0);
        return `${t.title} · ${t.list.name} · ${t.completedAt && t.completedAt < end ? "concluída" : "em aberto"} · ${formatDuration(spent)} cronometrados`;
      })} />
      <Entries title="Sono" items={sleep ? [`Deitou ${dateTime(sleep.bedAt)} · dormiu ${time(sleep.sleepAt)} · acordou ${dateTime(sleep.wakeAt)}`, ...(sleep.quality ? [`Qualidade ${sleep.quality}/5`] : []), sleep.note].filter(Boolean) : []} />
      <Entries title="Lazer" items={leisure.map(l => [l.activity, dateTime(l.startAt), l.endAt ? dateTime(l.endAt) : "em andamento", l.note].filter(Boolean).join(" · "))} />
      <Entries title="Metas registradas" items={goals.map(g => [g.project.name, g.done ? "feita" : "não feita", g.note].filter(Boolean).join(" · "))} />
      <Entries title="Lembretes" items={reminders.map(r => [r.title, time(r.lastSentAt && r.lastSentAt >= start && r.lastSentAt < end ? r.lastSentAt : r.at), r.note].filter(Boolean).join(" · "))} />
      <Entries title="Análise do dia" items={ai ? [ai.headline, ai.assessment, ...ai.suggestions] : []} />
    </div>
  </main>;
}
