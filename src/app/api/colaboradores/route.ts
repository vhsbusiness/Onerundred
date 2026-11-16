import { json, withAccess, requireString, readBody } from "@/lib/api";
import { inviteCollaborator, changeCollaboration, myCollaborations, pendingCollaborations } from "@/lib/collaborators";

export const GET = withAccess("collaboration", async (user, req: Request) => json(
  new URL(req.url).searchParams.get("todos") === "1" ? await myCollaborations(user.id) : await pendingCollaborations(user.id)
));
export const POST = withAccess("collaboration", async (user, req: Request) => {
  const body = await readBody(req);
  return json(await inviteCollaborator(user, requireString(body.username, "Usuário")), { status: 201 });
});
export const PATCH = withAccess("collaboration", async (user, req: Request) => {
  const body = await readBody(req);
  await changeCollaboration(user.id, requireString(body.id, "Convite"), requireString(body.action, "Ação"));
  return json({ ok: true });
});
