import { json, readBody, withUser } from "@/lib/api";
import { createReminder, listReminders } from "@/lib/reminders";

export const GET = withUser(async (user) => json(await listReminders(user.id, user.area)));

export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  return json(await createReminder(user.id, user.area, body), { status: 201 });
});
