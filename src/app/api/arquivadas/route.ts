import { json, withAccess } from "@/lib/api";
import { deleteAllArchived, listArchived } from "@/lib/repo";

export const GET = withAccess("boards", async (user) => json(await listArchived(user.id)));

/** Exclui todas as tarefas arquivadas (definitivo). */
export const DELETE = withAccess("boards", async (user) => json({ deleted: await deleteAllArchived(user.id) }));
