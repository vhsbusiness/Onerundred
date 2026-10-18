import { Dashboard } from "@/components/dashboard/Dashboard";
import { requireUserPage } from "@/lib/current-user";

export default async function Home() {
  await requireUserPage();
  return <Dashboard />;
}
