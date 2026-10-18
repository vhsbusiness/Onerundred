import { json, readBody, withAdmin } from "@/lib/api";
import { getAppSettings, updateAppSettings } from "@/lib/admin";

export const GET = withAdmin(async () => json(await getAppSettings()));

const NUMERIC = ["aiMinDaysTasks", "aiMinDaysWork", "aiMinNightsSleep", "aiMinDaysLeisure"] as const;

export const PATCH = withAdmin(async (_admin, req: Request) => {
  const body = await readBody(req);
  const data: Record<string, unknown> = {};
  if (body.allowRegistration !== undefined) data.allowRegistration = Boolean(body.allowRegistration);
  for (const k of NUMERIC) {
    if (body[k] !== undefined) data[k] = Number(body[k]);
  }
  return json(await updateAppSettings(data));
});
