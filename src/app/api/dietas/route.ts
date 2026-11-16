import { json, readBody, withAccess } from "@/lib/api";
import { coverData } from "@/lib/project-cover";
import { listDiets } from "@/lib/diet";
import { prisma } from "@/lib/db";
import { shortText } from "@/lib/organizer-input";

export const POST = withAccess("diet", async (user, req: Request) => {
  const { name, image } = await readBody(req);
  const imageData = coverData(image);
  const project = await prisma.dietProject.create({
    data: {
      ...(imageData && { cover: { create: { imageData } } }),
      userId: user.id,
      name: shortText(name, "nome do projeto", 80),
    },
    select: { id: true },
  });
  return json(project, { status: 201 });
});

export const GET = withAccess("diet", async (user) => json(await listDiets(user.id)));
