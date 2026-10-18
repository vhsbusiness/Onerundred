import { NextResponse } from "next/server";
import { handle, json, readBody } from "@/lib/api";
import {
  authEnabled,
  isCorrectPassword,
  isValidSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionToken,
} from "@/lib/auth";

/** Estado da autenticação: se há senha configurada e se o cookie atual é válido. */
export const GET = handle(async (req: Request) => {
  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return json({ enabled: authEnabled(), authenticated: await isValidSession(cookie) });
});

export const POST = handle(async (req: Request) => {
  const body = await readBody<{ password?: string }>(req);
  const candidate = typeof body.password === "string" ? body.password : "";

  if (!isCorrectPassword(candidate)) {
    return json({ error: "Senha incorreta" }, { status: 401 });
  }

  const token = await sessionToken();
  const res = NextResponse.json({ ok: true });
  if (token) {
    res.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
  }
  return res;
});

/** Sair: apaga o cookie. */
export const DELETE = handle(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
});
