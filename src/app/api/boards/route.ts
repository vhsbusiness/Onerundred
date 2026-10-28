import { json, readBody, requireString, withUser } from "@/lib/api";
import { createBoard, listBoardLists, listBoards } from "@/lib/repo";

/** ?listas=1 devolve só id, nome e listas de cada quadro (para mover tarefas e listas entre quadros). */
export const GET = withUser(async (user, req: Request) => {
  const url = new URL(req.url);
  if (url.searchParams.get("listas") === "1") return json(await listBoardLists(user.id));
  return json(await listBoards(user.id));
});

export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  const board = await createBoard(user.id, requireString(body.name, "name"));
  return json(board, { status: 201 });
});
