import { SleepPage } from "@/components/sleep/SleepPage";
import { requireUserPage } from "@/lib/current-user";

export default async function SonoPage() {
  await requireUserPage("/sono");
  return <SleepPage />;
}
