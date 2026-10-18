import { ApiError, handle, json, readBody } from "@/lib/api";
import { getSettings, updateSettings } from "@/lib/repo";

export const GET = handle(async () => json(await getSettings()));

export const PATCH = handle(async (req: Request) => {
  const body = await readBody(req);
  const n = Math.round(Number(body.dailyGoalMinutes));
  if (!Number.isFinite(n) || n <= 0 || n > 24 * 60) throw new ApiError(400, "Meta diária inválida");
  return json(await updateSettings({ dailyGoalMinutes: n }));
});
