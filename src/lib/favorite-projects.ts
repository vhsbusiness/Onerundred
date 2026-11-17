import { prisma } from "./db";
import { ApiError } from "./errors";

export type ProjectKind = "training" | "diet";
export type FavoriteProject = { id: string; kind: ProjectKind; name: string; href: string };
const prefix = "favoriteProject:";
const keyOf = (kind: ProjectKind, id: string) => prefix + kind + ":" + id;

export async function listFavoriteProjects(userId: string): Promise<FavoriteProject[]> {
  const saved = await prisma.setting.findMany({ where: { userId, key: { startsWith: prefix } }, orderBy: [{ value: "asc" }, { key: "asc" }] });
  const trainingIds = saved.filter(row => row.key.startsWith(prefix + "training:")).map(row => row.key.slice((prefix + "training:").length));
  const dietIds = saved.filter(row => row.key.startsWith(prefix + "diet:")).map(row => row.key.slice((prefix + "diet:").length));
  const [training, diets] = await Promise.all([
    prisma.project.findMany({ where: { userId, id: { in: trainingIds }, workout: { not: null }, archivedAt: null }, select: { id: true, name: true } }),
    prisma.dietProject.findMany({ where: { userId, id: { in: dietIds } }, select: { id: true, name: true } }),
  ]);
  const projects = new Map<string, FavoriteProject>();
  for (const p of training) projects.set(keyOf("training", p.id), { ...p, kind: "training", href: "/metas/treinos/" + p.id });
  for (const p of diets) projects.set(keyOf("diet", p.id), { ...p, kind: "diet", href: "/metas/dietas/" + p.id });
  return saved.flatMap(row => { const project = projects.get(row.key); return project ? [project] : []; });
}

export async function setProjectFavorite(userId: string, body: Record<string, unknown>) {
  const { id, kind, favorite } = body;
  if (typeof id !== "string" || !id || id.length > 100 || !["training", "diet"].includes(String(kind)) || typeof favorite !== "boolean")
    throw new ApiError(400, "Favorito inválido.");
  const exists = kind === "training"
    ? await prisma.project.findFirst({ where: { id, userId, workout: { not: null }, ...(favorite ? { archivedAt: null } : {}) }, select: { id: true } })
    : await prisma.dietProject.findFirst({ where: { id, userId }, select: { id: true } });
  if (!exists) throw new ApiError(404, "Projeto não encontrado.");
  const key = keyOf(kind as ProjectKind, id);
  if (favorite) {
    await prisma.setting.upsert({ where: { userId_key: { userId, key } }, create: { userId, key, value: new Date().toISOString() }, update: {} });
  } else {
    await prisma.setting.deleteMany({ where: { userId, key } });
  }
  return listFavoriteProjects(userId);
}
