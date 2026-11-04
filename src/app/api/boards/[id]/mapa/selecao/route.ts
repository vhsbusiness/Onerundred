import { ApiError, json, readBody, withUser } from "@/lib/api";
import { parseMindStyle } from "@/lib/mind-style";
import { editSelection, type SelectionEdit } from "@/lib/mind-selection";

export const POST = withUser(async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await readBody(req);
  if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 5000 ||
      !body.ids.every((value): value is string => typeof value === "string" && value.length > 0 && value.length <= 100)) {
    throw new ApiError(400, "Seleção inválida.");
  }
  let edit: SelectionEdit;
  if (body.action === "format" && body.patch && typeof body.patch === "object" && !Array.isArray(body.patch)) {
    const patch = parseMindStyle(body.patch as Record<string, unknown>);
    if (!Object.keys(patch).length) throw new ApiError(400, "Escolha uma alteração.");
    edit = { action: "format", patch };
  } else if (body.action === "delete") edit = { action: "delete" };
  else if (body.action === "move" && typeof body.dx === "number" && typeof body.dy === "number" &&
      Number.isSafeInteger(body.dx) && Number.isSafeInteger(body.dy)) {
    edit = { action: "move", dx: body.dx, dy: body.dy };
    if (body.titleEdit !== undefined) {
      const draft = body.titleEdit as Record<string, unknown> | null;
      if (!draft || typeof draft !== "object" || typeof draft.id !== "string" || typeof draft.title !== "string" || !draft.title.trim() || draft.title.trim().length > 160) throw new ApiError(400, "Texto inválido.");
      edit.titleEdit = { id: draft.id, title: draft.title.trim() };
    }
  } else if (body.action === "paint" && (body.field === "color" || body.field === "textColor" || body.field === "highlight") &&
      typeof body.value === "string" && /^#[0-9a-f]{6}$/i.test(body.value)) {
    edit = { action: "paint", field: body.field, value: body.value };
  } else throw new ApiError(400, "Ação inválida.");
  const result = await editSelection(id, user.id, [...new Set(body.ids)], edit);
  return json({ ok: true, ...result });
});
