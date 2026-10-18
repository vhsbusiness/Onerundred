import { BoardView } from "@/components/board/BoardView";
import { requireUserPage } from "@/lib/current-user";

export default async function QuadroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUserPage(`/quadros/${id}`);
  return <BoardView boardId={id} />;
}
