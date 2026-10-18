import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError } from "./errors";
import { SESSION_COOKIE, userFromSession, type CurrentUser } from "./auth";

/** Usuário logado (lê o cookie da requisição atual), ou null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  return userFromSession(store.get(SESSION_COOKIE)?.value);
}

/** Para rotas de API: 401 se não houver sessão. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Não autenticado");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new ApiError(403, "Acesso restrito ao administrador");
  return user;
}

/** Para páginas: redireciona para /login se não houver sessão. */
export async function requireUserPage(nextPath?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  return user;
}

export async function requireAdminPage(): Promise<CurrentUser> {
  const user = await requireUserPage("/admin");
  if (user.role !== "admin") redirect("/");
  return user;
}
