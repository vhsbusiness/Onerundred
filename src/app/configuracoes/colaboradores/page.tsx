import { requireUserPage } from "@/lib/current-user";
import { myCollaborations } from "@/lib/collaborators";
import { CollaboratorSettings } from "@/components/settings/CollaboratorSettings";

export default async function Page() {
  const user = await requireUserPage("/configuracoes/colaboradores");
  return <CollaboratorSettings data={await myCollaborations(user.id)} />;
}
