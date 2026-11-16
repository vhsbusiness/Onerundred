import { json, readBody, withAccess } from "@/lib/api";
import { readTraining, editTraining, removeTraining } from "@/lib/training";

type Context = { params: Promise<{ id: string }> };
export const PATCH = withAccess("training", async (user, req: Request, ctx: Context) => {
  await editTraining(user.id, (await ctx.params).id, await readBody(req));
  return json({ ok: true });
});
export const DELETE = withAccess("training", async (user, _req: Request, ctx: Context) => {
  await removeTraining(user.id, (await ctx.params).id);
  return json({ ok: true });
});

export const GET = withAccess("training", async (user,_req:Request,ctx:Context) => {
  const data = await readTraining(user.id,(await ctx.params).id);
  return data ? json(data) : json({error:"Projeto não encontrado."},{status:404});
});
