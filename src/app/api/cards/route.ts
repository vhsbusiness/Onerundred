import { json, optionalDayKey, optionalMinutes, optionalPriority, readBody, requireString, withAccess } from "@/lib/api";
import { createCard } from "@/lib/repo";

export const POST = withAccess("boards", async (user, req: Request) => {
  const body = await readBody(req);
  const card = await createCard(user.id, {
    listId: requireString(body.listId, "listId"),
    title: requireString(body.title, "title"),
    description: body.description !== undefined ? requireString(body.description, "description", { allowEmpty: true }) : undefined,
    priority: optionalPriority(body.priority),
    estimatedMinutes: optionalMinutes(body.estimatedMinutes),
    scheduledFor: optionalDayKey(body.scheduledFor),
  });
  return json(card, { status: 201 });
});
