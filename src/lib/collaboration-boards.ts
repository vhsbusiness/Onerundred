import { prisma } from "./db";
import { ApiError } from "./errors";
import { boardAccess } from "./repo";

export function readableOwner(managerId: string, collaborationId: string) {
  return { active: true, supervisors: { some: { id: collaborationId, managerId, accepted: true, shareBoards: true } } };
}

/** O acesso habitual entre membros continua independente da colaboração. */
export async function collaborationBoards(managerId: string, employeeId: string, collaborationId: string) {
  const boards = await prisma.board.findMany({
    where: { OR: [
      { user: readableOwner(managerId, collaborationId) },
      { AND: [boardAccess(managerId), boardAccess(employeeId)] },
    ] },
    select: { id: true, name: true, symbol: true, type: true, userId: true, members: { where: { userId: managerId }, select: { id: true } },
      editRequests: { where: { collaborationId }, select: { id: true } } },
    orderBy: { name: "asc" },
  });
  return boards.map(board => ({
    id: board.id, name: board.name, type: board.type, symbol: board.symbol,
    editable: board.userId === managerId || board.members.length > 0,
    pending: board.editRequests.length > 0,
  }));
}

export function pendingBoardRequests(ownerId: string) {
  return prisma.boardEditRequest.findMany({
    where: { board: { userId: ownerId }, collaboration: { employeeId: ownerId, accepted: true, shareBoards: true, manager: { active: true } } },
    select: { id: true, board: { select: { name: true } }, collaboration: { select: { manager: { select: { username: true } } } } },
  });
}

export async function requestBoardEdit(managerId: string, collaborationId: string, boardId: string) {
  const board = await prisma.board.findFirst({
    where: { id: boardId, user: readableOwner(managerId, collaborationId) },
    select: { members: { where: { userId: managerId }, select: { id: true } } },
  });
  if (!board) throw new ApiError(404, "Quadro indisponível.");
  if (board.members.length) return { editable: true };
  await prisma.boardEditRequest.upsert({
    where: { collaborationId_boardId: { collaborationId, boardId } },
    create: { collaborationId, boardId }, update: {},
  });
  return { editable: false };
}

export async function respondBoardRequest(ownerId: string, id: string, approve: boolean) {
  const where = { id, board: { userId: ownerId }, collaboration: { employeeId: ownerId, accepted: true, shareBoards: true, manager: { active: true } } };
  await prisma.$transaction(async tx => {
    const request = await tx.boardEditRequest.findFirst({ where, select: { boardId: true, collaboration: { select: { managerId: true } } } });
    if (!request || !(await tx.boardEditRequest.deleteMany({ where })).count) throw new ApiError(404, "Pedido indisponível.");
    if (approve) {
      const member = { boardId: request.boardId, userId: request.collaboration.managerId };
      await tx.boardMember.upsert({ where: { boardId_userId: member }, create: member, update: {} });
    }
  });
}
