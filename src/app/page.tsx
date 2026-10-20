import { Dashboard } from "@/components/dashboard/Dashboard";
import { DayReview } from "@/components/dashboard/DayReview";
import { getAiStatus } from "@/lib/ai";
import { requireUserPage } from "@/lib/current-user";
import { getDashboard, getDayReview } from "@/lib/repo";
import { todayKey } from "@/lib/time";

/** O dashboard já chega renderizado com os dados (sem tela de carregamento). ?dia=yyyy-MM-dd mostra a revisão de outro dia. */
export default async function Home({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const user = await requireUserPage();
  const { dia } = await searchParams;
  const today = todayKey();
  if (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia < today) {
    return <DayReview data={await getDayReview(user.id, dia)} />;
  }
  const [initialData, initialAi] = await Promise.all([getDashboard(user.id), getAiStatus(user.id)]);
  return <Dashboard initialData={initialData} initialAi={initialAi} />;
}
