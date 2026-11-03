import { json, withUser, requireString, readBody } from "@/lib/api";
import { inviteCollaborator, changeCollaboration, pendingCollaborations } from "@/lib/collaborators";

export const GET = withUser(async user => json(await pendingCollaborations(user.id)));
export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  return json(await inviteCollaborator(user, requireString(body.username, "Usuário")), { status: 201 });
});
export const PATCH = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  await changeCollaboration(user.id, requireString(body.id, "Convite"), requireString(body.action, "Ação"));
  return json({ ok: true });
});
