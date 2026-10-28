import { ApiError, json, optionalPriority, readBody, requireString, withUser } from "@/lib/api";
import { createRecurring } from "@/lib/repo";

/** Cria uma tarefa contínua: { listId, title, priority?, estimatedMinutes?, weekdays: number[] } */
export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  if (!Array.isArray(body.weekdays)) throw new ApiError(400, "weekdays deve ser uma lista de dias (0=dom … 6=sáb)");
  const est = body.estimatedMinutes === undefined || body.estimatedMinutes === null || body.estimatedMinutes === "" ? null : Number(body.estimatedMinutes);
  if (est !== null && (!Number.isFinite(est) || est <= 0)) throw new ApiError(400, "Estimativa inválida");
  return json(
    await createRecurring(user.id, {
      listId: requireString(body.listId, "listId"),
      title: requireString(body.title, "title"),
      description: typeof body.description === "string" ? body.description : "",
      priority: optionalPriority(body.priority),
      estimatedMinutes: est,
      weekdays: (body.weekdays as unknown[]).map(Number),
    }),
    { status: 201 },
  );
});
