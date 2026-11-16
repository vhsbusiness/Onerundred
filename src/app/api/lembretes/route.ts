import { json, readBody, withAccess } from "@/lib/api";
import { apiPrincipal } from "@/lib/personal-api";
import { createReminder, listOpenCards, listReminders } from "@/lib/reminders";

/** ?cardId= filtra os lembretes de uma tarefa; ?tarefas=1 devolve as tarefas abertas para associar. */
export const GET = withAccess("reminders", async (user, req: Request) => {
  const url = new URL(req.url);
  if (url.searchParams.get("tarefas")) {
    if (req.headers.has("authorization")) await apiPrincipal(req, "boards");
    return json(await listOpenCards(user.id));
  }
  return json(await listReminders(user.id, url.searchParams.get("cardId") ?? undefined));
});

export const POST = withAccess("reminders", async (user, req: Request) => {
  const body = await readBody(req);
  return json(await createReminder(user.id, body), { status: 201 });
});
