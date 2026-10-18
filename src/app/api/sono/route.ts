import { ApiError, json, optionalDayKey, readBody, requireString, withUser } from "@/lib/api";
import { getSleepPage, upsertSleep } from "@/lib/sleep";

export const GET = withUser(async (user) => json(await getSleepPage(user.id)));

export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  const dayKey = optionalDayKey(body.dayKey);
  if (!dayKey) throw new ApiError(400, "Informe o dia em que acordou (dayKey)");
  const quality = body.quality === undefined || body.quality === null || body.quality === "" ? null : Number(body.quality);
  if (quality !== null && (!Number.isInteger(quality) || quality < 1 || quality > 5)) {
    throw new ApiError(400, "Qualidade deve ser de 1 a 5");
  }
  const log = await upsertSleep(user.id, {
    dayKey,
    bedTime: requireString(body.bedTime, "bedTime"),
    sleepTime: requireString(body.sleepTime, "sleepTime"),
    wakeTime: requireString(body.wakeTime, "wakeTime"),
    quality,
    note: typeof body.note === "string" ? body.note.trim().slice(0, 500) : "",
  });
  return json(log, { status: 201 });
});
