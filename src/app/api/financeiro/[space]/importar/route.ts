import { withAccess, json, readBody } from "@/lib/api";
import { financeSpace } from "@/lib/finance";
import { confirmStatement, previewStatement } from "@/lib/statement-import";

type Context = { params: Promise<{ space: string }> };
export const POST = withAccess("finance", async (user, req: Request, ctx: Context) =>
  json(await previewStatement(user.id, financeSpace((await ctx.params).space), req)),
);
export const PUT = withAccess("finance", async (user, req: Request, ctx: Context) =>
  json(await confirmStatement(user.id, financeSpace((await ctx.params).space), await readBody(req))),
);
