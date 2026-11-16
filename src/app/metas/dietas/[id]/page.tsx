import { notFound } from "next/navigation";
import { DietDiary } from "@/components/metas/diet/DietDiary";
import { requireUserPage } from "@/lib/current-user";
import { readDiet } from "@/lib/diet";
import { validDay } from "@/lib/organizer-input";
import { todayKey } from "@/lib/time";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dia?: string }>;
}) {
  const { id } = await params;
  const user = await requireUserPage("/metas/dietas/" + id);
  const { dia } = await searchParams;
  const today = todayKey();
  const day = validDay(dia) ? dia : today;
  const data = await readDiet(user.id, id, day);
  if (!data) notFound();
  return <DietDiary key={id + day} data={data} day={day} today={today} />;
}
