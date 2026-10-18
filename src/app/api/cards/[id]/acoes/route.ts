import { ApiError, json, readBody, withUser } from "@/lib/api";
import { archiveCard, copyCard } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

/** action: "copy" | "archive" */
export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  if (body.action === "copy") return json(await copyCard(user.id, id), { status: 201 });
  if (body.action === "archive") {
    await archiveCard(user.id, id);
    return json({ ok: true });
  }
  throw new ApiError(400, "action deve ser copy ou archive");
});
