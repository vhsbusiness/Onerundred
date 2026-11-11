import { notFound } from "next/navigation";
import { TrainingDiary } from "@/components/metas/training/TrainingDiary";
import { requireUserPage } from "@/lib/current-user";
import { todayKey } from "@/lib/time";
import { readTraining } from "@/lib/training";

export default async function TrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserPage("/metas/treinos/" + id);
  const project = await readTraining(user.id, id);
  if (!project) notFound();
  return <TrainingDiary key={id} project={project} today={todayKey()} />;
}
