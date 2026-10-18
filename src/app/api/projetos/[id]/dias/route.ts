import { ApiError, json, optionalDayKey, readBody, withUser } from "@/lib/api";
import { setProjectDay } from "@/lib/projects";

type Ctx = { params: Promise<{ id: string }> };

/** Marca um dia do projeto como feito (done: true) ou não feito (done: false). */
export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  const dayKey = optionalDayKey(body.dayKey);
  if (!dayKey) throw new ApiError(400, "Informe o dia (dayKey)");
  if (typeof body.done !== "boolean") throw new ApiError(400, "Informe done (true/false)");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : undefined;
  return json(await setProjectDay(user.id, id, { dayKey, done: body.done, note }));
});
