import { pendingBoardRequests } from "./collaboration-boards";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { sendToUser } from "./notifications";
import { Prisma } from "@/generated/prisma/client";

const person = { name: true, username: true } as const;

export function pendingCollaborations(employeeId: string) {
  return prisma.collaboration.findMany({
    where: { employeeId, accepted: false, manager: { active: true } },
    select: { id: true, manager: { select: person } },
  });
}

export async function myCollaborations(userId: string) {
  const [sent, received, edits] = await Promise.all([
    prisma.collaboration.findMany({ where: { managerId: userId }, select: { id: true, accepted: true, employee: { select: person } }, orderBy: { createdAt: "desc" } }),
    prisma.collaboration.findMany({ where: { employeeId: userId }, select: { id: true, accepted: true, manager: { select: person } }, orderBy: { createdAt: "desc" } }),
    pendingBoardRequests(userId),
  ]);
  return { sent, received, edits };
}

export async function inviteCollaborator(manager: { id: string; username: string }, username: string) {
  const handle = username.trim().replace(/^@/, "").toLowerCase();
  const employee = await prisma.user.findFirst({ where: { username: handle, active: true }, select: { id: true } });
  if (!employee) throw new ApiError(404, "Usuário não encontrado.");
  if (employee.id === manager.id) throw new ApiError(400, "Escolha outra pessoa para colaborar.");
  let invite;
  try {
    invite = await prisma.collaboration.create({ data: { managerId: manager.id, employeeId: employee.id }, select: { id: true } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "Já existe um convite ou uma colaboração com esta pessoa.");
    }
    throw error;
  }
  await sendToUser(employee.id, {
    title: "Convite de colaboração",
    body: `@${manager.username} quer acompanhar seus dados. Veja os detalhes antes de aceitar.`,
    tag: `collaboration-${invite.id}`, url: "/configuracoes/colaboradores",
  }).catch(() => {});
  return invite;
}

export async function changeCollaboration(userId: string, id: string, action: string) {
  if (action === "accept") {
    const result = await prisma.collaboration.updateMany({
      where: { id, employeeId: userId, accepted: false, manager: { active: true } }, data: { accepted: true, shareBoards: true },
    });
    if (!result.count) throw new ApiError(404, "Convite indisponível.");
    return;
  }
  if (action === "shareBoards") {
    const result = await prisma.collaboration.updateMany({ where: { id, employeeId: userId, accepted: true }, data: { shareBoards: true } });
    if (!result.count) throw new ApiError(404, "Colaboração indisponível.");
    return;
  }
  if (action !== "remove") throw new ApiError(400, "Ação inválida.");
  const result = await prisma.collaboration.deleteMany({ where: { id, OR: [{ managerId: userId }, { employeeId: userId }] } });
  if (!result.count) throw new ApiError(404, "Colaboração indisponível.");
}
