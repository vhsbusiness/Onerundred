import { SettingsForm } from "@/components/settings/SettingsForm";
import { requireUserPage } from "@/lib/current-user";

export default async function ConfiguracoesPage() {
  await requireUserPage("/configuracoes");
  return <SettingsForm />;
}
