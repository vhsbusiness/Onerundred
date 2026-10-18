import { ProfilePage } from "@/components/profile/ProfilePage";
import { requireUserPage } from "@/lib/current-user";

export default async function PerfilPage() {
  await requireUserPage("/perfil");
  return <ProfilePage />;
}
