import { ApiError, json, readBody, withUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { createPersonalKey } from "@/lib/personal-api";
import { shortText } from "@/lib/organizer-input";

export const POST = withUser(async (user, req: Request) =>
  json(await createPersonalKey(user.id, await readBody(req)), { status: 201 }),
);
export const DELETE = withUser(async (user, req: Request) => {
  const { id } = await readBody(req);
  if (
    !(await prisma.personalApiKey.deleteMany({ where: { id: shortText(id, "chave"), userId: user.id } }))
      .count
  )
    throw new ApiError(404, "Chave não encontrada.");
  return json({ ok: true });
});
