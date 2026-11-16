import { json, withAccess } from "@/lib/api";
import { getDashboard } from "@/lib/repo";

export const GET = withAccess("dashboard", async (user) => json(await getDashboard(user.id)));
