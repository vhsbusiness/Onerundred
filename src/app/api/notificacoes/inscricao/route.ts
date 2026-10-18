import { json, readBody, withUser } from "@/lib/api";
import { getPrefs, subscribe, unsubscribe } from "@/lib/notifications";

/** Registra o aparelho (PushSubscription do navegador). */
export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  await subscribe(
    user.id,
    body.subscription as { endpoint: string; keys: { p256dh: string; auth: string } },
    req.headers.get("user-agent") ?? "",
  );
  return json(await getPrefs(user.id), { status: 201 });
});

/** Remove um aparelho (por endpoint ou id). */
export const DELETE = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  await unsubscribe(
    user.id,
    typeof body.endpoint === "string" ? body.endpoint : undefined,
    typeof body.id === "string" ? body.id : undefined,
  );
  return json(await getPrefs(user.id));
});
