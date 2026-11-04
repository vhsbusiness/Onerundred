import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoardView } from "@/components/board/BoardView";
import { requireUserPage } from "@/lib/current-user";
import { ApiError } from "@/lib/errors";
import { getBoard } from "@/lib/repo";

type Props = { params: Promise<{ id: string }> };

const loadBoard = cache(async (id: string) => {
  const user = await requireUserPage(`/quadros/${id}`);
  try {
    return { board: await getBoard(id, user.id), viewerId: user.id };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { board } = await loadBoard((await params).id);
  return board.type === "mindmap" ? { title: "Mapa mental" } : {};
}

export default async function QuadroPage({ params }: Props) {
  const { id } = await params;
  const { board, viewerId } = await loadBoard(id);
  return <BoardView viewerId={viewerId} boardId={id} initialBoard={board} />;
}
