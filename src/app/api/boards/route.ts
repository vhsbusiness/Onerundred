import { handle, json, readBody, requireString } from "@/lib/api";
import { createBoard, listBoards } from "@/lib/repo";

export const GET = handle(async () => json(await listBoards()));

export const POST = handle(async (req: Request) => {
  const body = await readBody(req);
  const board = await createBoard(requireString(body.name, "name"));
  return json(board, { status: 201 });
});
