import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { verifyPassword, type CurrentUser } from "./auth";
import { apiAreas, readOnlyArea, type Area, type Grants } from "./api-permissions";
import { shortText } from "./organizer-input";
import { consumeAuthAttempt } from "./security-rate";

const digest = (secret: string) => createHash("sha256").update(secret).digest("hex");
export function validatedGrants(value: unknown): Grants {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length)
    throw new ApiError(400, "Selecione pelo menos uma área.");
  const grants: Grants = {};
  for (const [k, v] of Object.entries(value)) {
    const key = k as Area;
    if (
      !Object.hasOwn(apiAreas, key) ||
      (v !== "read" && v !== "write") ||
      (v === "write" && readOnlyArea(key))
    )
      throw new ApiError(400, "Permissão inválida.");
    grants[key] = v;
  }
  return grants;
}
export async function createPersonalKey(userId: string, body: Record<string, unknown>) {
  const name = shortText(body.name, "nome da chave", 80);
  const grants = validatedGrants(body.grants);
  if (typeof body.password !== "string" || !body.password || body.password.length > 1024)
    throw new ApiError(400, "Informe sua senha atual.");
  const account = await prisma.user.findFirst({
    where: { id: userId, active: true, apiEnabled: true },
    select: { passwordHash: true },
  });
  if (!account) throw new ApiError(403, "A API não está liberada para esta conta.");
  await consumeAuthAttempt("api-key", userId, 12);
  if (!(await verifyPassword(body.password, account.passwordHash)))
    throw new ApiError(403, "Senha incorreta.");
  const secret = "onu_" + randomBytes(32).toString("base64url");
  await prisma.$transaction(async (tx) => {
    const allowed = await tx.user.updateMany({
      where: { id: userId, active: true, apiEnabled: true, passwordHash: account.passwordHash },
      data: { apiEnabled: true },
    });
    if (!allowed.count) throw new ApiError(403, "A conta mudou. Confirme sua senha novamente.");
    await tx.personalApiKey.create({
      data: { userId, name, grants, digest: digest(secret), suffix: secret.slice(-6) },
    });
  });
  return { secret };
}
export async function apiPrincipal(req: Request, area: Area): Promise<CurrentUser> {
  const match = /^Bearer (onu_[\w-]{43})$/i.exec(req.headers.get("authorization") ?? "");
  if (!match) throw new ApiError(401, "Chave de API inválida.");
  const key = await prisma.personalApiKey.findUnique({
    where: { digest: digest(match[1]) },
    select: {
      grants: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          avatar: true,
          active: true,
          apiEnabled: true,
        },
      },
    },
  });
  if (!key?.user.active || !key.user.apiEnabled)
    throw new ApiError(401, "Chave de API inválida ou revogada.");
  const grants = validatedGrants(key.grants);
  const grant = grants[area];
  if (!grant || (!["GET", "HEAD"].includes(req.method) && grant !== "write"))
    throw new ApiError(403, "A chave não permite esta operação.");
  const { id, name, email, username, avatar } = key.user;
  return { id, name, email, username, avatar, role: "user" };
}
export function listPersonalKeys(userId: string) {
  return prisma.personalApiKey.findMany({
    where: { userId },
    select: { id: true, name: true, suffix: true, grants: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}
