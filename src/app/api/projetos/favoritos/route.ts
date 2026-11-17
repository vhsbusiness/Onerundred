import { json, readBody, withUser } from "@/lib/api";
import { listFavoriteProjects, setProjectFavorite } from "@/lib/favorite-projects";

export const GET = withUser(async user => json(await listFavoriteProjects(user.id)));
export const PATCH = withUser(async (user, req: Request) => json(await setProjectFavorite(user.id, await readBody(req))));
