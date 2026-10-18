import { ApiError, json, optionalDayKey, readBody, requireString, withUser } from "@/lib/api";
import { deleteLeisure, updateLeisure } from "@/lib/leisure";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  const dayKey = optionalDayKey(body.dayKey);
  if (!dayKey) throw new ApiError(400, "Informe o dia (dayKey)");
  return json(
    await updateLeisure(user.id, id, {
      dayKey,
      startTime: requireString(body.startTime, "startTime"),
      endTime: requireString(body.endTime, "endTime"),
      activity: typeof body.activity === "string" ? body.activity : undefined,
      note: typeof body.note === "string" ? body.note : undefined,
    }),
  );
});

export const DELETE = withUser(async (user, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteLeisure(user.id, id);
  return json({ ok: true });
});
