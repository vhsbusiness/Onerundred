import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUserPage } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { readableOwner } from "@/lib/collaboration-boards";
import { BoardEditButton } from "@/components/settings/BoardEditButton";
import { readLabels } from "@/lib/labels";

export default async function ReadBoard({ params }: { params: Promise<{ id: string; boardId: string }> }) {
  const manager = await requireUserPage();
  const { id, boardId } = await params;
  const board = await prisma.board.findFirst({
    where: { id: boardId, user: readableOwner(manager.id, id) },
    select: { name: true, members: { where: { userId: manager.id }, select: { id: true } },
      editRequests: { where: { collaborationId: id }, select: { id: true } },
      lists: { orderBy: { position: "asc" }, select: { id: true, name: true,
        cards: { where: { archivedAt: null }, orderBy: { position: "asc" }, select: {
          id: true, title: true, description: true, labels: true, scheduledFor: true, estimatedMinutes: true,
          checklist: { orderBy: { position: "asc" }, select: { id: true, done: true, text: true } },
          images: { select: { id: true }, orderBy: { createdAt: "asc" } },
        } },
      } },
    },
  });
  if (!board) notFound();
  if (board.members.length) redirect(`/quadros/${boardId}`);
  return <main className="min-w-0 space-y-4">
    <Link href={`/configuracoes/colaboradores/${id}`} className="text-sm text-blue">← Relatório</Link>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm text-ink-3">Somente leitura</p><h1 className="break-words text-xl font-semibold">{board.name}</h1></div>
      <BoardEditButton collaborationId={id} boardId={boardId} pending={!!board.editRequests.length} />
    </header>
    <div className="flex items-start gap-3 overflow-x-auto pb-4">{board.lists.map(list => <section key={list.id} className="card w-72 max-w-[85vw] shrink-0 space-y-2 p-3">
      <h2 className="break-words font-semibold">{list.name} · {list.cards.length}</h2>
      {list.cards.map(card => <details key={card.id} className="rounded-xl border border-line bg-well p-3 text-sm [overflow-wrap:anywhere]">
        <summary className="cursor-pointer font-medium">{card.title}</summary>
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1">{readLabels(card.labels).map(label => <span key={label.name} className={`pill pill-${label.color}`}>{label.name}</span>)}</div>
          {card.description && <p className="whitespace-pre-wrap">{card.description}</p>}
          {card.estimatedMinutes && <p>Estimativa · {card.estimatedMinutes} min</p>}
          <ul>{card.checklist.map(item => <li key={item.id}>{item.done ? "☑" : "☐"} {item.text}</li>)}</ul>
          {card.images.map((img, index) => <a key={img.id} className="block text-blue" target="_blank" rel="noopener noreferrer" href={`/api/imagens/${img.id}?colaboracao=${id}`}>Ver imagem {index + 1}</a>)}
        </div>
      </details>)}
    </section>)}</div>
  </main>;
}
