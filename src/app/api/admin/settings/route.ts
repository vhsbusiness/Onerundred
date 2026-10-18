import { json, readBody, withAdmin } from "@/lib/api";
import { getAppSettings, updateAppSettings } from "@/lib/admin";

export const GET = withAdmin(async () => json(await getAppSettings()));

export const PATCH = withAdmin(async (_admin, req: Request) => {
  const body = await readBody(req);
  return json(
    await updateAppSettings({
      allowRegistration: body.allowRegistration === undefined ? undefined : Boolean(body.allowRegistration),
    }),
  );
});
