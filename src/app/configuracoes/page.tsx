import { SettingsForm } from "@/components/settings/SettingsForm";
import { requireUserPage } from "@/lib/current-user";

import { getSettings } from "@/lib/repo";
import { prisma } from "@/lib/db";

export default async function ConfiguracoesPage() {
  const user = await requireUserPage("/configuracoes");
  const [settings, collaborators] = await Promise.all([getSettings(user.id), prisma.collaboration.findMany({
    where: { managerId: user.id, accepted: true, employee: { active: true } },
    select: { id: true, employee: { select: { name: true, username: true } } },
    orderBy: { employee: { name: "asc" } },
  })]);
  return <SettingsForm collaborators={collaborators} workChime={settings.workChime} />;
}
