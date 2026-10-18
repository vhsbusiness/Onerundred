import { NextResponse } from "next/server";
import { handle, readBody, requireString } from "@/lib/api";
import { authenticate, createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export const POST = handle(async (req: Request) => {
  const body = await readBody(req);
  const user = await authenticate(
    requireString(body.identifier, "identifier"),
    typeof body.password === "string" ? body.password : "",
  );
  const token = await createSession(user.id, req.headers.get("user-agent") ?? "");
  const res = NextResponse.json(user);
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
});
