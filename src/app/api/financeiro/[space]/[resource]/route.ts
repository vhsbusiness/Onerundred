import { json, readBody, withAccess } from "@/lib/api";
import { financeSpace, writeFinance } from "@/lib/finance";

const mutate = withAccess(
  "finance",
  async (user, req: Request, ctx: { params: Promise<{ space: string; resource: string }> }) => {
    const { space, resource } = await ctx.params;
    await writeFinance(user.id, financeSpace(space), resource, req.method, await readBody(req));
    return json({ ok: true });
  },
);
export { mutate as POST, mutate as PATCH, mutate as DELETE };
