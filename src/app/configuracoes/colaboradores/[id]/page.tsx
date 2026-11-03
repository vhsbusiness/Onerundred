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
  const [lists, sessions, boards] = await Promise.all([
    prisma.list.findMany({ where: { board }, select: {
      priority: true, kind: true, cards: { select: {
        priority: true, scheduledFor: true, createdAt: true, completedAt: true, archivedAt: true,
        postponements: { select: { dayKey: true } },
      } },
    } }),
    prisma.workSession.findMany({ where: { userId, startedAt: dateFilter }, orderBy: { startedAt: "asc" }, select: { startedAt: true, endedAt: true } }),
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
        <ol aria-label="Notas diárias, de zero a cem por cento" className="grid grid-cols-7 gap-1 text-center text-xs tabular-nums">
          {week.map(day => {
            const date = day.key.slice(8) + "/" + day.key.slice(5, 7);
            const label = day.score === null ? "Sem dados" : day.score + "%";
            return <li key={day.key} className="min-w-0">
              <Link prefetch={false} href={`?dia=${day.key}`} aria-label={date + " · " + label} aria-current={day.key === dia ? "date" : undefined}
                className="group flex flex-col items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-blue">
                <span className="text-ink">{day.score === null ? "—" : label}</span>
                <span aria-hidden="true" className="flex h-24 w-1/2 max-w-9 items-end overflow-hidden rounded bg-well">
                  {day.score !== null && <span className="w-full min-h-px rounded-t bg-blue" style={{ height: day.score + "%" }} />}
                </span>
                <span className="text-ink-2 group-hover:underline">{date}</span>
              </Link>
            </li>;
          })}
        </ol>
        {week.some(day => day.score === null) && <p className="text-xs text-ink-3">— Sem dados no dia</p>}
      </section>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <Entries title={`Trabalho · ${formatDuration(workMs)}`} items={sessions.map(s => `${dateTime(s.startedAt)} até ${s.endedAt ? dateTime(s.endedAt) : "agora"}`)} />
      <details className="card min-w-0 self-start p-5">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-blue">
          <span className="font-semibold">Quadros de {link.employee.name}</span>
          <span className="btn">Ver quadros</span>
        </summary>
        <div className="mt-3 space-y-3">
          {!link.shareBoards && <p className="text-xs text-ink-3">Para disponibilizar os quadros privados, o colaborador pode ativar a leitura nas configurações de colaboração.</p>}
          {!boards.length && <p className="text-sm text-ink-3">Nenhum quadro disponível para consulta.</p>}
          {boards.map(b => <div key={b.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <div className="min-w-0 flex-1"><strong className="break-words">{b.name}</strong><p className="text-xs text-ink-3">{b.editable ? "Compartilhado · edição liberada" : "Somente leitura"}</p></div>
            <Link className="btn" prefetch={false} href={b.editable ? `/quadros/${b.id}` : `/configuracoes/colaboradores/${id}/quadros/${b.id}`}>Ver quadro</Link>
            {!b.editable && <BoardEditButton collaborationId={id} boardId={b.id} pending={b.pending} />}
          </div>)}
        </div>
      </details>
    </div>
  </main>;
}
