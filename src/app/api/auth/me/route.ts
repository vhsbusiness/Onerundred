import { handle, json } from "@/lib/api";
import { registrationAllowed } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";

/** Quem está logado (ou null) e se o cadastro está aberto. */
export const GET = handle(async () => {
  const user = await getCurrentUser();
  return json({ user, allowRegistration: await registrationAllowed() });
});
