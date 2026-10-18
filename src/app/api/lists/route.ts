import { ApiError, handle, json, optionalPriority, readBody, requireString } from "@/lib/api";
import { createList } from "@/lib/repo";
import type { ListKind } from "@/lib/types";

const KINDS: ListKind[] = ["normal", "tomorrow", "done"];

export const POST = handle(async (req: Request) => {
  const body = await readBody(req);
  const kind = body.kind === undefined ? undefined : (body.kind as ListKind);
  if (kind !== undefined && !KINDS.includes(kind)) throw new ApiError(400, "Tipo de lista inválido");
  const list = await createList({
    boardId: requireString(body.boardId, "boardId"),
    name: requireString(body.name, "name"),
    priority: optionalPriority(body.priority),
    kind,
  });
  return json(list, { status: 201 });
});
