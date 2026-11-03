import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserPage } from "@/lib/current-user";
import { dayKey, dayRange, formatDayLong, formatDuration, keyToDate, todayKey } from "@/lib/time";
import { collaborationBoards } from "@/lib/collaboration-boards";
import { BoardEditButton } from "@/components/settings/BoardEditButton";
import { periodScore } from "@/lib/metrics";
import { subDays } from "date-fns";
import { ReportDate } from "@/components/settings/ReportDate";

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
    select: { shareBoards: true, employeeId: true, employee: { select: { name: true, username: true } } },
  });
  if (!link) notFound();
  const userId = link.employeeId;
  const today = todayKey();
  const { dia = today } = await searchParams;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || dayKey(keyToDate(dia)) !== dia || dia > today) notFound();
  const { start, end } = dayRange(dia);
  const dateFilter = { gte: start, lt: end };
  const board = { userId, type: "tasks" };
  const [lists, sessions, tasks, boards] = await Promise.all([
    prisma.list.findMany({ where: { board }, select: {
      priority: true, kind: true, cards: { select: {
        priority: true, scheduledFor: true, createdAt: true, completedAt: true, archivedAt: true,
        postponements: { select: { dayKey: true } },
      } },
    } }),
    prisma.workSession.findMany({ where: { userId, startedAt: dateFilter }, orderBy: { startedAt: "asc" }, select: { startedAt: true, endedAt: true } }),
    prisma.card.findMany({ where: {
      list: { board },
      OR: [{ scheduledFor: dia }, { completedAt: dateFilter }, { sessions: { some: { startedAt: dateFilter } } }],
    }, select: { title: true, completedAt: true, list: { select: { name: true } }, sessions: { where: { startedAt: dateFilter }, select: { startedAt: true, endedAt: true } } }, orderBy: { title: "asc" } }),
    collaborationBoards(manager.id, userId, id),
  ]);
  const cards = lists.flatMap(list => list.cards.map(card => ({
    ...card, listPriority: list.priority, listKind: list.kind,
    postponedDays: card.postponements.map(entry => entry.dayKey),
  })));
  const hasTodayList = lists.some(list => list.kind === "today");
  const week = Array.from({ length: 7 }, (_, index) => {
    const key = dayKey(subDays(start, 6 - index));
    const range = dayRange(key);
    return { key, ...periodScore(cards, range.start, range.end, key, { hasTodayList }) };
  });
  const selected = week[6];
  const now = new Date().getTime();
  const workMs = sessions.reduce((sum, session) => sum + (session.endedAt?.getTime() ?? now) - session.startedAt.getTime(), 0);
  return <main className="space-y-4">
    <Link href="/configuracoes/colaboradores" className="text-sm text-blue">← Colaboradores</Link>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">{link.employee.name}</h1>
        <p className="text-sm text-ink-2">@{link.employee.username} · Relatório de trabalho · {formatDayLong(dia)}</p></div>
    </header>
    <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
      <ReportDate value={dia} max={today} />
      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Resumo do trabalho</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><p className="text-xs text-ink-3">Nota das tarefas</p><strong>{selected.score === null ? "Sem dados" : selected.score + "%"}</strong></div>
          <div><p className="text-xs text-ink-3">Tempo trabalhado</p><strong>{formatDuration(workMs)}</strong></div>
          <div><p className="text-xs text-ink-3">Tarefas concluídas</p><strong>{selected.doneCount}</strong></div>
          <div><p className="text-xs text-ink-3">Sessões de trabalho</p><strong>{sessions.length}</strong></div>
        </div>
        <h3 className="text-sm font-semibold">Nota das tarefas nos últimos sete dias</h3>
        <div className="flex flex-wrap gap-2">{week.map(d => <Link key={d.key} prefetch={false} href={`?dia=${d.key}`} className="btn text-xs">{d.key.slice(8)}/{d.key.slice(5,7)} · {d.score === null ? "—" : d.score + "%"}</Link>)}</div>
      </section>
    </div>
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">Quadros de {link.employee.name}</h2>
      {!link.shareBoards && <p className="text-xs text-ink-3">Para disponibilizar os quadros privados, o colaborador pode ativar a leitura nas configurações de colaboração.</p>}
      {!boards.length && <p className="text-sm text-ink-3">Nenhum quadro disponível para consulta.</p>}
      {boards.map(b => <div key={b.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <div className="min-w-0 flex-1"><strong className="break-words">{b.name}</strong><p className="text-xs text-ink-3">{b.editable ? "Compartilhado · edição liberada" : "Somente leitura"}</p></div>
        <Link className="btn" prefetch={false} href={b.editable ? `/quadros/${b.id}` : `/configuracoes/colaboradores/${id}/quadros/${b.id}`}>Ver quadro</Link>
        {!b.editable && <BoardEditButton collaborationId={id} boardId={b.id} pending={b.pending} />}
      </div>)}
    </section>
    <div className="grid gap-4 md:grid-cols-2">
      <Entries title={`Trabalho · ${formatDuration(workMs)}`} items={sessions.map(s => `${dateTime(s.startedAt)} até ${s.endedAt ? dateTime(s.endedAt) : "agora"}`)} />
      <Entries title="Tarefas dos quadros próprios" items={tasks.map(t => {
        const spent = t.sessions.reduce((sum,s) => sum + (s.endedAt?.getTime() ?? Date.now()) - s.startedAt.getTime(), 0);
        return `${t.title} · ${t.list.name} · ${t.completedAt && t.completedAt < end ? "concluída" : "em aberto"} · ${formatDuration(spent)} cronometrados`;
      })} />
    </div>
  </main>;
}
