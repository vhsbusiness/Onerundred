import { handle, json } from "@/lib/api";
import { getDashboard } from "@/lib/repo";

export const GET = handle(async () => json(await getDashboard()));
