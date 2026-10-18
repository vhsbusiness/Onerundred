import { handle, json } from "@/lib/api";
import { listArchived } from "@/lib/repo";

export const GET = handle(async () => json(await listArchived()));
