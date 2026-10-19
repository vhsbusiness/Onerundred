import { Dashboard } from "@/components/dashboard/Dashboard";
import { getAiStatus } from "@/lib/ai";
import { requireUserPage } from "@/lib/current-user";
import { getDashboard } from "@/lib/repo";

/** O dashboard já chega renderizado com os dados (sem tela de carregamento). */
export default async function Home() {
  const user = await requireUserPage();
  const [initialData, initialAi] = await Promise.all([getDashboard(user.id, user.area), getAiStatus(user.id, user.area)]);
  return <Dashboard initialData={initialData} initialAi={initialAi} />;
}
