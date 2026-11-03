import { SettingsForm } from "@/components/settings/SettingsForm";
import { requireUserPage } from "@/lib/current-user";

import { prisma } from "@/lib/db";

export default async function ConfiguracoesPage() {
  const user = await requireUserPage("/configuracoes");
  const collaborators = await prisma.collaboration.findMany({
    where: { managerId: user.id, accepted: true, employee: { active: true } },
    select: { id: true, employee: { select: { name: true, username: true } } },
    orderBy: { employee: { name: "asc" } },
  });
  return <SettingsForm collaborators={collaborators} />;
}
