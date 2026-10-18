import { json, withUser } from "@/lib/api";
import { getLastUndo, undoLast } from "@/lib/repo";

export const GET = withUser(async (user) => json({ last: await getLastUndo(user.id) }));

/** Desfaz a última ação em lote do usuário. */
export const POST = withUser(async (user) => {
  const r = await undoLast(user.id);
  return json({ undone: r?.label ?? null, last: await getLastUndo(user.id) });
});
