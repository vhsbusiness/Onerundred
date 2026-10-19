import { json, withUser } from "@/lib/api";
import { deleteAllArchived, listArchived } from "@/lib/repo";

export const GET = withUser(async (user) => json(await listArchived(user.id, user.area)));

/** Exclui todas as tarefas arquivadas (definitivo). */
export const DELETE = withUser(async (user) => json({ deleted: await deleteAllArchived(user.id, user.area) }));
