import { ApiError, handle, json, readBody, withUser } from "@/lib/api";
import { registrationAllowed, updateProfile } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";

/** Quem está logado (ou null) e se o cadastro está aberto. */
export const GET = handle(async () => {
  const user = await getCurrentUser();
  return json({ user, allowRegistration: await registrationAllowed() });
});

/** Atualiza nome, usuário, e-mail e/ou foto do próprio perfil. */
export const PATCH = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  const str = (v: unknown, field: string) => {
    if (v === undefined) return undefined;
    if (typeof v !== "string") throw new ApiError(400, `Campo "${field}" inválido`);
    return v;
  };
  const avatar = body.avatar === undefined ? undefined : body.avatar === null ? null : str(body.avatar, "avatar");
  const updated = await updateProfile(user.id, {
    name: str(body.name, "name"),
    email: str(body.email, "email"),
    username: str(body.username, "username"),
    avatar,
  });
  return json(updated);
});
