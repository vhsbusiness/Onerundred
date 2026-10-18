import { ProjectsPage } from "@/components/metas/ProjectsPage";
import { requireUserPage } from "@/lib/current-user";

export default async function MetasPage() {
  await requireUserPage("/metas");
  return <ProjectsPage />;
}
