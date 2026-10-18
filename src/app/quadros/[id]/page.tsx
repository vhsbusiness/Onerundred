import { notFound } from "next/navigation";
import { BoardView } from "@/components/board/BoardView";
import { requireUserPage } from "@/lib/current-user";
import { ApiError } from "@/lib/errors";
import { getBoard } from "@/lib/repo";
import type { BoardDTO } from "@/lib/types";

async function loadBoard(id: string, userId: string): Promise<BoardDTO | null> {
  try {
    return await getBoard(id, userId);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export default async function QuadroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserPage(`/quadros/${id}`);
  const board = await loadBoard(id, user.id);
  if (!board) notFound();
  return <BoardView boardId={id} initialBoard={board} />;
}
