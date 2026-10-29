import { canPreviewDesign } from "@/lib/design-preview";
import { ApiError, handle, json, readBody, withUser } from "@/lib/api";
import { registrationAllowed, updateProfile } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { getSettings } from "@/lib/repo";

/** Quem está logado (ou null) e se o cadastro está aberto. */
export const GET = handle(async () => {
  const user = await getCurrentUser();
  const settings = user ? await getSettings(user.id) : null;
  const theme = settings?.theme ?? null;
  // Studio é o padrão global; getSettings já resolve a comparação por conta.
  const design = settings?.design ?? null;
  return json({ user, theme, design, canPreviewDesign: canPreviewDesign(user), allowRegistration: await registrationAllowed() });
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
