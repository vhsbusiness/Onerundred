import { apiPrincipal } from "@/lib/personal-api";
import { ApiError, json, readBody, requireString, withAccess } from "@/lib/api";
import { cancelInvite, inviteToBoard, removeMember } from "@/lib/sharing";

type Ctx = { params: Promise<{ id: string }> };

/** Convida pelo @: { username } */
export const POST = withAccess("collaboration", async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (req.headers.has("authorization")) await apiPrincipal(req, "boards");
  const body = await readBody(req);
  return json(await inviteToBoard(user.id, id, requireString(body.username, "username")), { status: 201 });
});

/** Remove membro ({ userId }), cancela convite ({ inviteUserId }) ou sai do quadro ({ leave: true }). */
export const DELETE = withAccess("collaboration", async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (req.headers.has("authorization")) await apiPrincipal(req, "boards");
  const body = await readBody(req);
  if (body.leave === true) {
    await removeMember(user.id, id, user.id);
  } else if (typeof body.userId === "string") {
    await removeMember(user.id, id, body.userId);
  } else if (typeof body.inviteUserId === "string") {
    await cancelInvite(user.id, id, body.inviteUserId);
  } else {
    throw new ApiError(400, "Informe userId, inviteUserId ou leave");
  }
  return json({ ok: true });
});
