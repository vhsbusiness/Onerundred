import { ApiError, json, readBody, requireString, withUser } from "@/lib/api";
import { archiveAllCards, copyList, moveAllCards, pullByPriority } from "@/lib/repo";
import { organizeListByImportance } from "@/lib/ai";

type Ctx = { params: Promise<{ id: string }> };

/** action: "copy" | "moveCards" (toListId) | "archiveCards" | "pullPriority" (priority) | "aiSort" */
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
    case "pullPriority": {
      const p = Number(body.priority);
      if (p !== 1 && p !== 2 && p !== 3) throw new ApiError(400, "priority deve ser 1, 2 ou 3");
      return json({ moved: await pullByPriority(id, p, user.id) });
    }
    case "aiSort":
      return json(await organizeListByImportance(user.id, id));
    default:
      throw new ApiError(400, "action deve ser copy, moveCards, archiveCards, pullPriority ou aiSort");
  }
});
