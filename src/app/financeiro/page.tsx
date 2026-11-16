import { FinancePage } from "@/components/finance/FinancePage";
import { requireUserPage } from "@/lib/current-user";
import { financeOverview } from "@/lib/finance";
import { validMonth } from "@/lib/finance-format";
import { todayKey } from "@/lib/time";

export const metadata = { title: "Financeiro · Onerundred" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ espaco?: string; mes?: string }>;
}) {
  const user = await requireUserPage("/financeiro");
  const query = await searchParams;
  const space = query.espaco === "empresa" ? "business" : "personal";
  const today = todayKey();
  const month = validMonth(query.mes) ? query.mes : today.slice(0, 7);
  return (
    <FinancePage
      key={space + month}
      space={space}
      month={month}
      today={today}
      overview={await financeOverview(user.id, space, month)}
    />
  );
}
