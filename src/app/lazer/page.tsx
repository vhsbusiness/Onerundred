import { LeisurePage } from "@/components/leisure/LeisurePage";
import { requireUserPage } from "@/lib/current-user";

export default async function LazerPage() {
  await requireUserPage("/lazer");
  return <LeisurePage />;
}
