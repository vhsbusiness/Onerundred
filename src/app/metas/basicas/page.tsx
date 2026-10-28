import { TargetsPage } from "@/components/metas/TargetsPage";
import { requireUserPage } from "@/lib/current-user";

export default async function MetasBasicasPage() {
  await requireUserPage("/metas/basicas");
  return <TargetsPage />;
}
