import { AdminPanel } from "@/components/admin/AdminPanel";
import { requireAdminPage } from "@/lib/current-user";

export default async function AdminPage() {
  await requireAdminPage();
  return <AdminPanel />;
}
