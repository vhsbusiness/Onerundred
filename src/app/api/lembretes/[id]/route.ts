import { json, readBody, withAccess } from "@/lib/api";
import { deleteReminder, updateReminder } from "@/lib/reminders";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withAccess("reminders", async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  return json(await updateReminder(user.id, id, body));
});

export const DELETE = withAccess("reminders", async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteReminder(user.id, id);
  return json({ ok: true });
});
