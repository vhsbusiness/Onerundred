import { json, withUser } from "@/lib/api";
import { getDashboard } from "@/lib/repo";

export const GET = withUser(async (user) => json(await getDashboard(user.id)));
