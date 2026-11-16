import { json, readBody, withAccess } from "@/lib/api";
import { requireDay } from "@/lib/organizer-input";
import { todayKey } from "@/lib/time";
import { readDiet, writeDiet } from "@/lib/diet";

export const POST = withAccess(
  "diet",
  async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await writeDiet(user.id, (await ctx.params).id, await readBody(req));
    return json({ ok: true });
  },
);

export const GET = withAccess(
  "diet",
  async (user, req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const data = await readDiet(
      user.id,
      (await ctx.params).id,
      requireDay(new URL(req.url).searchParams.get("dia") ?? todayKey()),
    );
    return data ? json(data) : json({ error: "Projeto não encontrado." }, { status: 404 });
  },
);
