import { isBoardSymbol } from "@/lib/board-icons";
import { ApiError, json, readBody, requireString, withUser } from "@/lib/api";
import { createBoard, listBoardLists, listBoards } from "@/lib/repo";

/** ?listas=1 devolve só id, nome e listas de cada quadro (para mover tarefas e listas entre quadros). */
export const GET = withUser(async (user, req: Request) => {
  const url = new URL(req.url);
  if (url.searchParams.get("listas") === "1") return json(await listBoardLists(user.id));
  return json(await listBoards(user.id));
});

export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  if (body.symbol != null && !isBoardSymbol(body.symbol)) throw new ApiError(400, "Ícone inválido");
  if (body.type !== undefined && body.type !== "tasks" && body.type !== "organization" && body.type !== "mindmap") throw new ApiError(400, "Tipo de quadro inválido");
  const board = await createBoard(user.id, requireString(body.name, "name"), body.type as "tasks" | "organization" | "mindmap" | undefined, body.symbol as string | undefined);
  return json(board, { status: 201 });
});
