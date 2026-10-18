import { ApiError, json, optionalDayKey, readBody, requireString, withUser } from "@/lib/api";
import { createLeisure, getLeisurePage, startLeisure, stopLeisure } from "@/lib/leisure";

export const GET = withUser(async (user) => json(await getLeisurePage(user.id)));

/**
 * action: "start" começa um bloco agora; "stop" encerra o bloco em andamento;
 * sem action, registra um bloco manual (dayKey, startTime, endTime, activity, note).
 */
export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  if (body.action === "start") {
    return json(await startLeisure(user.id, typeof body.activity === "string" ? body.activity : undefined), { status: 201 });
  }
  if (body.action === "stop") return json(await stopLeisure(user.id));
  const dayKey = optionalDayKey(body.dayKey);
  if (!dayKey) throw new ApiError(400, "Informe o dia (dayKey)");
  const log = await createLeisure(user.id, {
    dayKey,
    startTime: requireString(body.startTime, "startTime"),
    endTime: requireString(body.endTime, "endTime"),
    activity: typeof body.activity === "string" ? body.activity : undefined,
    note: typeof body.note === "string" ? body.note : undefined,
  });
  return json(log, { status: 201 });
});
