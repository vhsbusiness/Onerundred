import { json, withUser } from "@/lib/api";
import { listArchived } from "@/lib/repo";

export const GET = withUser(async (user) => json(await listArchived(user.id)));
