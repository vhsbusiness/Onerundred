import { ApiKeys } from "@/components/profile/ApiKeys";
import { validatedGrants, listPersonalKeys } from "@/lib/personal-api";
import { prisma } from "@/lib/db";
import { ProfilePage } from "@/components/profile/ProfilePage";
import { requireUserPage } from "@/lib/current-user";

export default async function PerfilPage() {
  const user = await requireUserPage("/perfil");
  const enabled = await prisma.user.findUniqueOrThrow({where:{id:user.id},select:{apiEnabled:true}});
  const keys = enabled.apiEnabled ? await listPersonalKeys(user.id) : [];
  return <><ProfilePage />{enabled.apiEnabled && <ApiKeys keys={keys.map(k=>({id:k.id,name:k.name,suffix:k.suffix,grants:validatedGrants(k.grants)}))}/>}</>;
}
