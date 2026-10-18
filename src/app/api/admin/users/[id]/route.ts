import { ApiError, json, readBody, withAdmin } from "@/lib/api";
import { deleteUser, updateUser } from "@/lib/admin";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withAdmin(async (admin, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  const role = body.role === undefined ? undefined : body.role;
  if (role !== undefined && role !== "user" && role !== "admin") throw new ApiError(400, "Papel inválido");
  const active = body.active === undefined ? undefined : Boolean(body.active);
  await updateUser(admin.id, id, { role: role as "user" | "admin" | undefined, active });
  return json({ ok: true });
});

export const DELETE = withAdmin(async (admin, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteUser(admin.id, id);
  return json({ ok: true });
});
