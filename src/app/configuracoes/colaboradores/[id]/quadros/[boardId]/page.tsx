import { notFound, redirect } from "next/navigation";
import { requireUserPage } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { readableOwner } from "@/lib/collaboration-boards";
import { cardInclude, serializeCard } from "@/lib/repo";
import { ReadOnlyBoard } from "@/components/board/ReadOnlyBoard";
import type { ListKind } from "@/lib/types";
import { todayKey } from "@/lib/time";

export default async function ReadBoard({ params }: { params: Promise<{ id: string; boardId: string }> }) {
  const manager = await requireUserPage();
  const { id, boardId } = await params;
  const board = await prisma.board.findFirst({
    where: { id: boardId, user: readableOwner(manager.id, id) },
    select: { name: true, symbol: true, type: true, mindNodes: true, members: { where: { userId: manager.id }, select: { id: true } },
      editRequests: { where: { collaborationId: id }, select: { id: true } },
      lists: { orderBy: { position: "asc" }, include: {
        cards: { where: { archivedAt: null }, orderBy: { position: "asc" }, include: cardInclude },
      } },
    },
  });
  if (!board) notFound();
  if (board.members.length) redirect(`/quadros/${boardId}`);
  const lists = board.lists.map(list => ({ ...list, kind: list.kind as ListKind, cards: list.cards.map(serializeCard) }));
  return <ReadOnlyBoard symbol={board.symbol} name={board.name} organization={board.type === "organization"} lists={lists} mindNodes={board.type === "mindmap" ? board.mindNodes : undefined}
    collaborationId={id} boardId={boardId} pending={board.editRequests.length > 0} today={todayKey()} />;
}
