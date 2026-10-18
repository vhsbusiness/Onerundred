import { json, withUser } from "@/lib/api";
import { sendTest } from "@/lib/notifications";

export const POST = withUser(async (user) => json({ delivered: await sendTest(user.id) }));
