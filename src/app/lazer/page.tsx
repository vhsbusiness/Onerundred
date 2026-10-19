import { redirect } from "next/navigation";
import { LeisurePage } from "@/components/leisure/LeisurePage";
import { requireUserPage } from "@/lib/current-user";

/** Só existe na área Pessoal: na Profissional volta para o dashboard. */
export default async function LeisurePageRoute() {
  const user = await requireUserPage("/lazer");
  if (user.area !== "pessoal") redirect("/");
  return <LeisurePage />;
}
