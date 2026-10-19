import { redirect } from "next/navigation";
import { BoardsGrid } from "@/components/boards/BoardsGrid";
import { requireUserPage } from "@/lib/current-user";
import { lastBoardId } from "@/lib/repo";

/** /quadros abre o último quadro visto; /quadros?lista=1 mostra todos. */
export default async function QuadrosPage({
  searchParams,
}: {
  searchParams: Promise<{ lista?: string }>;
}) {
  const user = await requireUserPage("/quadros");
  const { lista } = await searchParams;
  if (!lista) {
    const last = await lastBoardId(user.id);
    if (last) redirect(`/quadros/${last}`);
  }
  return <BoardsGrid />;
}
