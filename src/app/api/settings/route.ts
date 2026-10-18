import { ApiError, json, readBody, withUser } from "@/lib/api";
import { getSettings, updateSettings } from "@/lib/repo";

export const GET = withUser(async (user) => json(await getSettings(user.id)));

export const PATCH = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  const n = Math.round(Number(body.dailyGoalMinutes));
  if (!Number.isFinite(n) || n <= 0 || n > 24 * 60) throw new ApiError(400, "Meta diária inválida");
  return json(await updateSettings(user.id, { dailyGoalMinutes: n }));
});
