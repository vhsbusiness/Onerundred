import { RemindersPage } from "@/components/reminders/RemindersPage";
import { requireUserPage } from "@/lib/current-user";

export default async function LembretesPage() {
  await requireUserPage("/lembretes");
  return <RemindersPage />;
}
