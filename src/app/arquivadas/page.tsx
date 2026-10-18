import { ArchiveList } from "@/components/archive/ArchiveList";
import { requireUserPage } from "@/lib/current-user";

export default async function ArquivadasPage() {
  await requireUserPage("/arquivadas");
  return <ArchiveList />;
}
