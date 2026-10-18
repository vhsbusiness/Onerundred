import { BoardView } from "@/components/board/BoardView";

export default async function QuadroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BoardView boardId={id} />;
}
