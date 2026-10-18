import { NextResponse, type NextRequest } from "next/server";

/**
 * Checagem rápida: sem cookie de sessão, nem tenta carregar a página.
 * A validação real da sessão (token existe, não expirou, usuário ativo)
 * acontece em src/lib/current-user.ts, nas páginas e rotas de API.
 */
const SESSION_COOKIE = "onerundred_session";
const PUBLIC_PREFIXES = ["/login", "/api/auth/", "/icon", "/apple-icon", "/manifest", "/sw.js", "/api/notificacoes/tick"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest|sw.js|icons/).*)"],
};
