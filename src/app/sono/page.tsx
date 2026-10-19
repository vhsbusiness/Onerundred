import { redirect } from "next/navigation";
import { SleepPage } from "@/components/sleep/SleepPage";
import { requireUserPage } from "@/lib/current-user";

/** Só existe na área Pessoal: na Profissional volta para o dashboard. */
export default async function SleepPageRoute() {
  const user = await requireUserPage("/sono");
  if (user.area !== "pessoal") redirect("/");
  return <SleepPage />;
}
