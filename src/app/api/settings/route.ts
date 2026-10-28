import { ApiError, json, readBody, withUser } from "@/lib/api";
import { getSettings, updateSettings } from "@/lib/repo";
import { isDesign, isTheme } from "@/lib/theme";
import type { SettingsDTO, TargetsDTO } from "@/lib/types";

export const GET = withUser(async (user) => json(await getSettings(user.id)));

function minutesOrNull(v: unknown, label: string, max: number): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0 || n > max) throw new ApiError(400, `${label} inválida`);
  return n;
}
function clockOrNull(v: unknown, label: string): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new ApiError(400, `${label} inválida (HH:MM)`);
  return v;
}

export const PATCH = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  const data: Partial<Omit<SettingsDTO, "targets">> & { targets?: Partial<TargetsDTO> } = {};
  if (body.dailyGoalMinutes !== undefined) {
    const n = Math.round(Number(body.dailyGoalMinutes));
    if (!Number.isFinite(n) || n <= 0 || n > 24 * 60) throw new ApiError(400, "Meta diária inválida");
    data.dailyGoalMinutes = n;
  }
  if (body.theme !== undefined) {
    if (!isTheme(body.theme)) throw new ApiError(400, "Tema inválido");
    data.theme = body.theme;
  }
  if (body.design !== undefined) {
    // Design 2.0 é experimental: só o admin liga/desliga, e só para a própria conta.
    if (user.role !== "admin") throw new ApiError(403, "O Design 2.0 está disponível só para o administrador");
    if (!isDesign(body.design)) throw new ApiError(400, "Design inválido");
    data.design = body.design;
  }
  if (body.targets && typeof body.targets === "object") {
    const t = body.targets as Record<string, unknown>;
    data.targets = {
      sleepMinutes: minutesOrNull(t.sleepMinutes, "Meta de sono", 16 * 60),
      bedtime: clockOrNull(t.bedtime, "Hora de deitar"),
      wake: clockOrNull(t.wake, "Hora de acordar"),
      leisureMinutes: minutesOrNull(t.leisureMinutes, "Meta de lazer", 12 * 60),
      performanceTarget: minutesOrNull(t.performanceTarget, "Meta de performance", 100),
    };
  }
  if (Object.keys(data).length === 0) throw new ApiError(400, "Nada para salvar");
  return json(await updateSettings(user.id, data));
});
