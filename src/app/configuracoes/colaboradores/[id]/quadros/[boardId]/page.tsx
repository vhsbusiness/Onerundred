import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUserPage } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { readableOwner } from "@/lib/collaboration-boards";
import { cardInclude, serializeCard } from "@/lib/repo";
import { ReadOnlyBoard } from "@/components/board/ReadOnlyBoard";
import type { ListKind } from "@/lib/types";
import { todayKey } from "@/lib/time";

type Props = { params: Promise<{ id: string; boardId: string }> };

const loadBoard = cache(async (id: string, boardId: string) => {
  const manager = await requireUserPage();
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
  return { board, viewerId: manager.id };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, boardId } = await params;
  const { board } = await loadBoard(id, boardId);
  return board.type === "mindmap" ? { title: "Mapa mental" } : {};
}

export default async function ReadBoard({ params }: Props) {
  const { id, boardId } = await params;
  const { board, viewerId } = await loadBoard(id, boardId);
  const lists = board.lists.map(list => ({ ...list, kind: list.kind as ListKind, cards: list.cards.map(serializeCard) }));
  return <ReadOnlyBoard viewerId={viewerId} symbol={board.symbol} name={board.name} organization={board.type === "organization"} lists={lists} mindNodes={board.type === "mindmap" ? board.mindNodes : undefined}
    collaborationId={id} boardId={boardId} pending={board.editRequests.length > 0} today={todayKey()} />;
}
