import { cookies } from "next/headers";
import { ApiError, json, readBody, withUser } from "@/lib/api";
import { changePassword, SESSION_COOKIE } from "@/lib/auth";

export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
    throw new ApiError(400, "Informe a senha atual e a nova");
  }
  const store = await cookies();
  await changePassword(user.id, body.currentPassword, body.newPassword, store.get(SESSION_COOKIE)?.value);
  return json({ ok: true });
});
