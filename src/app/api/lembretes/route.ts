import { json, readBody, withUser } from "@/lib/api";
import { createReminder, listOpenCards, listReminders } from "@/lib/reminders";

/** ?cardId= filtra os lembretes de uma tarefa; ?tarefas=1 devolve as tarefas abertas para associar. */
export const GET = withUser(async (user, req: Request) => {
  const url = new URL(req.url);
  if (url.searchParams.get("tarefas")) return json(await listOpenCards(user.id));
  return json(await listReminders(user.id, url.searchParams.get("cardId") ?? undefined));
});

export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  return json(await createReminder(user.id, body), { status: 201 });
});
