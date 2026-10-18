/**
 * Proteção por senha única (app de um usuário só).
 *
 * Quando APP_PASSWORD está definida, todas as rotas exigem o cookie de sessão,
 * cujo valor é um HMAC da senha (com AUTH_SECRET opcional como sal extra).
 * Sem APP_PASSWORD, o app fica aberto (uso local).
 *
 * Usa Web Crypto para funcionar tanto no proxy quanto nas rotas.
 */

export const SESSION_COOKIE = "onerundred_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

export function configuredPassword(): string | null {
  const p = process.env.APP_PASSWORD?.trim();
  return p ? p : null;
}

export function authEnabled(): boolean {
  return configuredPassword() !== null;
}

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Token esperado no cookie para a senha configurada. */
export async function sessionToken(): Promise<string | null> {
  const password = configuredPassword();
  if (!password) return null;
  const secret = process.env.AUTH_SECRET?.trim() || "onerundred";
  return hmacHex(`${secret}:${password}`, "session-v1");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  const expected = await sessionToken();
  if (!expected) return true; // sem senha configurada
  if (!cookieValue) return false;
  return safeEqual(cookieValue, expected);
}

export function isCorrectPassword(candidate: string): boolean {
  const password = configuredPassword();
  if (!password) return true;
  return safeEqual(candidate, password);
}
