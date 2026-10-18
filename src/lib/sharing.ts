import { prisma } from "./db";
import { ApiError } from "./errors";
import { sendToUser } from "./notifications";
import type { BoardInviteDTO, UserBrief } from "./types";

/*
 * Compartilhamento de quadros: o dono convida pelo @; o convidado vê no sininho
 * e aceita (vira membro, com acesso igual ao do dono, exceto excluir o quadro
 * e gerenciar membros) ou recusa.
 */

const brief = { id: true, name: true, username: true, avatar: true } as const;

/** Busca usuários pelo @ (ou nome) para o campo de convite. */
export async function searchUsers(q: string, excludeUserId: string): Promise<UserBrief[]> {
  const term = q.trim().replace(/^@/, "").toLowerCase();
  if (term.length < 2) return [];
  return prisma.user.findMany({
    where: {
      active: true,
      NOT: { id: excludeUserId },
      OR: [{ username: { contains: term } }, { name: { contains: term } }, { name: { contains: term.charAt(0).toUpperCase() + term.slice(1) } }],
    },
    select: brief,
    orderBy: { username: "asc" },
    take: 6,
  });
}

export async function inviteToBoard(ownerId: string, boardId: string, username: string): Promise<UserBrief> {
  const board = await prisma.board.findFirst({ where: { id: boardId, userId: ownerId }, include: { user: { select: { name: true, username: true } } } });
  if (!board) throw new ApiError(403, "Só o dono do quadro pode convidar");
  const handle = username.trim().replace(/^@/, "").toLowerCase();
  const user = await prisma.user.findUnique({ where: { username: handle }, select: { ...brief, active: true } });
  if (!user || !user.active) throw new ApiError(404, `Não achei o usuário @${handle}`);
  if (user.id === ownerId) throw new ApiError(400, "Esse quadro já é seu");
  const member = await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId, userId: user.id } } });
  if (member) throw new ApiError(409, `@${handle} já participa deste quadro`);

  await prisma.boardInvite.upsert({
    where: { boardId_toUserId: { boardId, toUserId: user.id } },
    create: { boardId, fromUserId: ownerId, toUserId: user.id, status: "pending" },
    update: { fromUserId: ownerId, status: "pending", respondedAt: null, createdAt: new Date() },
  });

  // Aviso no aparelho, se o convidado tiver notificações ligadas.
  sendToUser(user.id, {
    title: `${board.user.name} te convidou para um quadro`,
    body: `"${board.name}" — toque para aceitar no sininho.`,
    url: "/quadros?lista=1",
    tag: `invite-${boardId}`,
  }).catch(() => {});

  const { active: _a, ...rest } = user;
  void _a;
  return rest;
}

export async function cancelInvite(ownerId: string, boardId: string, toUserId: string) {
  const board = await prisma.board.findFirst({ where: { id: boardId, userId: ownerId } });
  if (!board) throw new ApiError(403, "Só o dono do quadro pode cancelar convites");
  await prisma.boardInvite.deleteMany({ where: { boardId, toUserId, status: "pending" } });
}

export async function removeMember(requesterId: string, boardId: string, memberUserId: string) {
  const board = await prisma.board.findFirst({ where: { id: boardId } });
  if (!board) throw new ApiError(404, "Quadro não encontrado");
  const isOwner = board.userId === requesterId;
  const isSelf = memberUserId === requesterId;
  if (!isOwner && !isSelf) throw new ApiError(403, "Sem permissão");
  await prisma.boardMember.deleteMany({ where: { boardId, userId: memberUserId } });
  // Membros que saem podem ser convidados de novo depois.
  await prisma.boardInvite.deleteMany({ where: { boardId, toUserId: memberUserId } });
}

export async function listMyInvites(userId: string): Promise<BoardInviteDTO[]> {
  const rows = await prisma.boardInvite.findMany({
    where: { toUserId: userId, status: "pending" },
    include: { board: { select: { id: true, name: true } }, from: { select: brief } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    boardId: r.board.id,
    boardName: r.board.name,
    from: r.from,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function respondInvite(userId: string, inviteId: string, accept: boolean): Promise<{ boardId: string }> {
  const invite = await prisma.boardInvite.findFirst({ where: { id: inviteId, toUserId: userId, status: "pending" } });
  if (!invite) throw new ApiError(404, "Convite não encontrado ou já respondido");
  await prisma.$transaction([
    prisma.boardInvite.update({
      where: { id: inviteId },
      data: { status: accept ? "accepted" : "declined", respondedAt: new Date() },
    }),
    ...(accept
      ? [
          prisma.boardMember.upsert({
            where: { boardId_userId: { boardId: invite.boardId, userId } },
            create: { boardId: invite.boardId, userId },
            update: {},
          }),
        ]
      : []),
  ]);
  return { boardId: invite.boardId };
}
