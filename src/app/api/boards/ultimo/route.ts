import { json, withUser } from "@/lib/api";
import { lastBoardId } from "@/lib/repo";

export const GET = withUser(async user => json({ id: await lastBoardId(user.id) }));
