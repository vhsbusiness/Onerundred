import { json, withAdmin } from "@/lib/api";
import { getOverview, listUsers } from "@/lib/admin";

export const GET = withAdmin(async () => {
  const [overview, users] = await Promise.all([getOverview(), listUsers()]);
  return json({ overview, users });
});
