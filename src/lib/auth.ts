import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "./db";
import { ApiError } from "./errors";

const scrypt = promisify(scryptCb);

export const SESSION_COOKIE = "onerundred_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

export type Role = "user" | "admin";

export interface CurrentUser {
  id: string;
  email: string;
  username: string;
  name: string;
  role: Role;
  avatar: string | null;
}

function toCurrentUser(u: { id: string; email: string; username: string; name: string; role: string; avatar: string | null }): CurrentUser {
  return { id: u.id, email: u.email, username: u.username, name: u.name, role: u.role as Role, avatar: u.avatar };
}

/* ───────────── Senhas ───────────── */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, hex] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hex) return false;
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/* ───────────── Validação de cadastro ───────────── */

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

export function normalizeUsername(v: string): string {
  return v.trim().toLowerCase();
}

export function validateRegistration(input: {
  name: string;
  email: string;
  username: string;
  password: string;
}) {
  if (input.name.trim().length < 2) throw new ApiError(400, "Informe seu nome");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new ApiError(400, "E-mail inválido");
  if (!/^[a-z0-9_.]{3,24}$/.test(input.username)) {
    throw new ApiError(400, "Usuário deve ter de 3 a 24 caracteres: letras, números, ponto ou _");
  }
  if (input.password.length < 8) throw new ApiError(400, "A senha precisa ter pelo menos 8 caracteres");
}

/* ───────────── Sessões ───────────── */

export async function createSession(userId: string, userAgent = ""): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.authSession.create({
    data: {
      id: token,
      userId,
      userAgent: userAgent.slice(0, 200),
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000),
    },
  });
  return token;
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await prisma.authSession.deleteMany({ where: { id: token } });
}

/** Usuário dono de um token de sessão válido, ou null. */
export async function userFromSession(token: string | undefined): Promise<CurrentUser | null> {
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { id: token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return toCurrentUser(session.user);
}

/* ───────────── Cadastro / login ───────────── */

export async function registrationAllowed(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: "allowRegistration" } });
  return row ? row.value !== "false" : true;
}

export async function registerUser(input: {
  name: string;
  email: string;
  username: string;
  password: string;
}): Promise<CurrentUser> {
  const email = normalizeEmail(input.email);
  const username = normalizeUsername(input.username);
  validateRegistration({ ...input, email, username });

  const userCount = await prisma.user.count();
  if (userCount > 0 && !(await registrationAllowed())) {
    throw new ApiError(403, "Cadastro desativado pelo administrador");
  }

  const clash = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { email: true, username: true },
  });
  if (clash?.email === email) throw new ApiError(409, "Já existe uma conta com esse e-mail");
  if (clash?.username === username) throw new ApiError(409, "Esse nome de usuário já está em uso");

  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      username,
      passwordHash: await hashPassword(input.password),
      // O primeiro usuário do sistema vira administrador.
      role: userCount === 0 ? "admin" : "user",
      lastLoginAt: new Date(),
    },
  });
  return toCurrentUser(user);
}

/** Login por e-mail ou nome de usuário. */
export async function authenticate(identifier: string, password: string): Promise<CurrentUser> {
  const id = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: id }, { username: id }] },
  });
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) throw new ApiError(401, "Usuário ou senha incorretos");
  if (!user.active) throw new ApiError(403, "Conta desativada. Fale com o administrador.");
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return toCurrentUser(user);
}

/* ───────────── Perfil ───────────── */

export const MAX_AVATAR_BYTES = 300 * 1024;

export async function updateProfile(
  userId: string,
  input: { name?: string; email?: string; username?: string; avatar?: string | null },
): Promise<CurrentUser> {
  const data: { name?: string; email?: string; username?: string; avatar?: string | null } = {};

  if (input.name !== undefined) {
    if (input.name.trim().length < 2) throw new ApiError(400, "Informe seu nome");
    data.name = input.name.trim();
  }
  if (input.email !== undefined) {
    const email = normalizeEmail(input.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "E-mail inválido");
    const clash = await prisma.user.findFirst({ where: { email, NOT: { id: userId } }, select: { id: true } });
    if (clash) throw new ApiError(409, "Já existe uma conta com esse e-mail");
    data.email = email;
  }
  if (input.username !== undefined) {
    const username = normalizeUsername(input.username);
    if (!/^[a-z0-9_.]{3,24}$/.test(username)) {
      throw new ApiError(400, "Usuário deve ter de 3 a 24 caracteres: letras, números, ponto ou _");
    }
    const clash = await prisma.user.findFirst({ where: { username, NOT: { id: userId } }, select: { id: true } });
    if (clash) throw new ApiError(409, "Esse nome de usuário já está em uso");
    data.username = username;
  }
  if (input.avatar !== undefined) {
    if (input.avatar === null || input.avatar === "") {
      data.avatar = null;
    } else {
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(input.avatar)) {
        throw new ApiError(400, "Foto inválida");
      }
      if (input.avatar.length > MAX_AVATAR_BYTES * 1.4) throw new ApiError(400, "Foto grande demais (máx. 300 KB)");
      data.avatar = input.avatar;
    }
  }

  const user = await prisma.user.update({ where: { id: userId }, data });
  return toCurrentUser(user);
}

/** Troca a senha conferindo a atual e derruba as outras sessões. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepSessionToken?: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "Usuário não encontrado");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ApiError(400, "Senha atual incorreta");
  }
  if (newPassword.length < 8) throw new ApiError(400, "A nova senha precisa ter pelo menos 8 caracteres");
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
  await prisma.authSession.deleteMany({
    where: { userId, ...(keepSessionToken ? { NOT: { id: keepSessionToken } } : {}) },
  });
}
