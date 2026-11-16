import { ApiError, json, readBody, withAccess } from "@/lib/api";
import { updateProfile } from "@/lib/auth";
import { shortText } from "@/lib/organizer-input";

export const GET = withAccess("profile", async (user) =>
  json({
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    avatar: user.avatar,
  }),
);

export const PATCH = withAccess("profile", async (user, req: Request) => {
  const body = await readBody(req);
  if (body.name === undefined && body.avatar === undefined)
    throw new ApiError(400, "Informe o nome de exibição ou a foto.");
  if (Object.keys(body).some((field) => field !== "name" && field !== "avatar"))
    throw new ApiError(400, "Campo de perfil inválido.");
  if (body.avatar !== undefined && body.avatar !== null && typeof body.avatar !== "string")
    throw new ApiError(400, "Foto inválida.");
  const profile = await updateProfile(user.id, {
    name: body.name === undefined ? undefined : shortText(body.name, "nome", 120),
    avatar: body.avatar,
  });
  return json({ id: profile.id, name: profile.name, avatar: profile.avatar });
});
