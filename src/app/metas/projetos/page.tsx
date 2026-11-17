import { ProjectDirectory } from "@/components/metas/ProjectReturn";
import { TrainingProjects } from "@/components/metas/training/TrainingProjects";
import { requireUserPage } from "@/lib/current-user";
import { listDiets } from "@/lib/diet";
import { listTraining } from "@/lib/training";

export default async function TrainingProjectsPage({ searchParams }: { searchParams: Promise<{ lista?: string }> }) {
  const user = await requireUserPage("/metas/projetos");
  const [projects, diets] = await Promise.all([listTraining(user.id), listDiets(user.id)]);
  const list = [...projects.map(p => "/metas/treinos/" + p.id), ...diets.map(p => "/metas/dietas/" + p.id)];
  const browse = (await searchParams).lista === "1";
  return <ProjectDirectory key={String(browse)} userId={user.id} projects={list} browse={browse}>
    <TrainingProjects projects={projects} diets={diets} />
  </ProjectDirectory>;
}
