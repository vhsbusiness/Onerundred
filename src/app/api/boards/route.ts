import { json, readBody, requireString, withUser } from "@/lib/api";
import { createBoard, listBoards } from "@/lib/repo";

export const GET = withUser(async (user) => json(await listBoards(user.id, user.area)));

export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  const board = await createBoard(user.id, user.area, requireString(body.name, "name"));
  return json(board, { status: 201 });
});
