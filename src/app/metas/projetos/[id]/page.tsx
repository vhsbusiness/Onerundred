import { ProjectDetail } from "@/components/metas/ProjectDetail";
import { requireUserPage } from "@/lib/current-user";

export default async function ProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUserPage(`/metas/projetos/${id}`);
  return <ProjectDetail projectId={id} />;
}
