import { ApiError, json, readBody, withAccess } from "@/lib/api";
import { addCardImage, removeCardImage } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

/** Anexa uma imagem (data URL) à tarefa. */
export const POST = withAccess("boards", async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  if (typeof body.image !== "string") throw new ApiError(400, "Envie a imagem (data URL)");
  return json(await addCardImage(user.id, id, body.image), { status: 201 });
});

export const DELETE = withAccess("boards", async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  if (typeof body.imageId !== "string") throw new ApiError(400, "imageId obrigatório");
  return json(await removeCardImage(user.id, id, body.imageId));
});
