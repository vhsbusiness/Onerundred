import { BoardsGrid } from "@/components/boards/BoardsGrid";
import { requireUserPage } from "@/lib/current-user";

export default async function QuadrosPage() {
  await requireUserPage("/quadros");
  return <BoardsGrid />;
}
