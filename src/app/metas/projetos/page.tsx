import { TrainingProjects } from "@/components/metas/training/TrainingProjects";
import { requireUserPage } from "@/lib/current-user";
import { listTraining } from "@/lib/training";

export default async function TrainingProjectsPage() {
  const user = await requireUserPage("/metas/projetos");
  return <TrainingProjects projects={await listTraining(user.id)} />;
}
