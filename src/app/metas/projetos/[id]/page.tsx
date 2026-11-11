import { notFound, redirect } from "next/navigation";
import { ProjectDetail } from "@/components/metas/ProjectDetail";
import { requireUserPage } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export default async function ProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserPage("/metas/projetos/" + id);
  const project = await prisma.project.findFirst({ where: { id, userId: user.id }, select: { workout: true } });
  if (!project) notFound();
  if (project.workout) redirect("/metas/treinos/" + id);
  return <ProjectDetail projectId={id} />;
}
