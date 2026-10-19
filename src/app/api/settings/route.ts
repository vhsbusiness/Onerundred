import { ApiError, json, readBody, withUser } from "@/lib/api";
import { getSettings, updateSettings } from "@/lib/repo";
import { isTheme } from "@/lib/theme";
import type { SettingsDTO } from "@/lib/types";

export const GET = withUser(async (user) => json(await getSettings(user.id, user.area)));

export const PATCH = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  const data: Partial<SettingsDTO> = {};
  if (body.dailyGoalMinutes !== undefined) {
    const n = Math.round(Number(body.dailyGoalMinutes));
    if (!Number.isFinite(n) || n <= 0 || n > 24 * 60) throw new ApiError(400, "Meta diária inválida");
    data.dailyGoalMinutes = n;
  }
  if (body.theme !== undefined) {
    if (!isTheme(body.theme)) throw new ApiError(400, "Tema inválido");
    data.theme = body.theme;
  }
  if (Object.keys(data).length === 0) throw new ApiError(400, "Nada para salvar");
  return json(await updateSettings(user.id, user.area, data));
});
