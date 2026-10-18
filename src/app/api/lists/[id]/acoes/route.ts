import { ApiError, json, readBody, requireString, withUser } from "@/lib/api";
import { archiveAllCards, copyList, moveAllCards } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

/** action: "copy" | "moveCards" (toListId) | "archiveCards" */
export const POST = withUser(async (user, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  switch (body.action) {
    case "copy":
      return json(await copyList(id, user.id), { status: 201 });
    case "moveCards":
      return json({ moved: await moveAllCards(id, requireString(body.toListId, "toListId"), user.id) });
    case "archiveCards":
      return json({ archived: await archiveAllCards(id, user.id) });
    default:
      throw new ApiError(400, "action deve ser copy, moveCards ou archiveCards");
  }
});
