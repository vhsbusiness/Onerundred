import { json, withAccess } from "@/lib/api";
import { financeSpace, financeOverview } from "@/lib/finance";
import { todayKey } from "@/lib/time";
export const GET = withAccess(
  "finance",
  async (user, req: Request, ctx: { params: Promise<{ space: string }> }) => {
    const space = financeSpace((await ctx.params).space);
    return json(
      await financeOverview(
        user.id,
        space,
        new URL(req.url).searchParams.get("mes") ?? todayKey().slice(0, 7),
      ),
    );
  },
);
