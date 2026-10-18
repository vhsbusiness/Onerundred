import { json, readBody, withUser } from "@/lib/api";
import { ALL_TYPES, getPrefs, updatePrefs } from "@/lib/notifications";
import type { NotificationType } from "@/lib/types";

export const GET = withUser(async (user) => json(await getPrefs(user.id)));

/** Liga/desliga o geral e cada tipo: { enabled?, goalReminder?, longWork?, … } */
export const PATCH = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  const input: Partial<Record<NotificationType | "enabled", boolean>> = {};
  if (typeof body.enabled === "boolean") input.enabled = body.enabled;
  for (const t of ALL_TYPES) {
    if (typeof body[t] === "boolean") input[t] = body[t] as boolean;
  }
  return json(await updatePrefs(user.id, input));
});
