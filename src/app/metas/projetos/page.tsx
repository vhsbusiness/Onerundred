import { TrainingProjects } from "@/components/metas/training/TrainingProjects";
import { requireUserPage } from "@/lib/current-user";
import { listDiets } from "@/lib/diet";
import { listTraining } from "@/lib/training";

export default async function TrainingProjectsPage() {
  const user = await requireUserPage("/metas/projetos");
  const [projects, diets] = await Promise.all([listTraining(user.id), listDiets(user.id)]);
  return <TrainingProjects projects={projects} diets={diets} />;
}
