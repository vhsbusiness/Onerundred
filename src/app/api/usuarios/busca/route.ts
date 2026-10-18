import { json, withUser } from "@/lib/api";
import { searchUsers } from "@/lib/sharing";

/** GET /api/usuarios/busca?q=vit → usuários para convidar */
export const GET = withUser(async (user, req: Request) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json(await searchUsers(q, user.id));
});
