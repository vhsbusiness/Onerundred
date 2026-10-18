import OpenAI from "openai";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { aiEnabled } from "./ai";
import { todayKey, tomorrowKey } from "./time";
import type { ImportPlan, ImportPlanCard, ImportPlanList, ListKind } from "./types";

/*
 * "Trazer dados": o usuário envia um print do Trello (ou de qualquer lista de
 * tarefas); a IA lê a imagem e devolve listas e tarefas. Comparamos com o
 * quadro atual e criamos só o que ainda não existe.
 */

export const MAX_IMPORT_IMAGE_CHARS = 6 * 1024 * 1024; // ~4,5 MB de imagem em base64

function modelName(): string {
  return process.env.OPENAI_IMPORT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
}

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    lists: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["normal", "tomorrow", "done"] },
          priority: { type: "integer", enum: [1, 2, 3] },
          cards: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                priority: { type: "integer", enum: [1, 2, 3] },
                estimatedMinutes: { type: "integer", minimum: 0 },
                done: { type: "boolean" },
              },
              required: ["title", "priority", "estimatedMinutes", "done"],
            },
          },
        },
        required: ["name", "kind", "priority", "cards"],
      },
    },
  },
  required: ["lists"],
} as const;

interface Extracted {
  lists: { name: string; kind: ListKind; priority: 1 | 2 | 3; cards: { title: string; priority: 1 | 2 | 3; estimatedMinutes: number; done: boolean }[] }[];
}

const SYSTEM = `Você lê prints de quadros do Trello (ou de outras listas de tarefas) e devolve a estrutura em JSON.

- Cada coluna vira uma lista com o nome exatamente como aparece. Cada cartão vira uma tarefa com o título exatamente como aparece (sem inventar tarefas que não estão na imagem).
- kind: "done" para listas de coisas concluídas (Feito, Done, Concluído, Pronto…), "tomorrow" para listas de amanhã/próximo dia, "normal" para o resto.
- priority da lista e das tarefas: 1 = alta, 2 = média, 3 = baixa. Use o nome da lista, etiquetas, cores ou palavras como "urgente", "importante", "secundário" para inferir; na dúvida, 2.
- estimatedMinutes: só se a imagem mostrar um tempo (ex.: "30 min", "1h"); senão 0.
- done: true quando a tarefa está riscada, com check, ou dentro de uma lista de concluídos.
- Ignore elementos de interface (botões, "Adicionar cartão", menus). Se a imagem não parecer um quadro de tarefas, devolva lists vazio.`;

/** Lê a imagem com a IA e devolve listas/tarefas. */
export async function extractFromImage(image: string): Promise<Extracted> {
  if (!aiEnabled()) throw new ApiError(503, "IA não configurada (OPENAI_API_KEY ausente)");
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) throw new ApiError(400, "Imagem inválida");
  if (image.length > MAX_IMPORT_IMAGE_CHARS) throw new ApiError(400, "Imagem grande demais");

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = modelName();
  const completion = await client.chat.completions.create({
    model,
    ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: "low" as const } : {}),
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Extraia as listas e tarefas deste print." },
          { type: "image_url", image_url: { url: image, detail: "high" } },
        ],
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: "quadro", strict: true, schema: extractionSchema } },
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new ApiError(502, "A IA não conseguiu ler a imagem");
  const parsed = JSON.parse(raw) as Extracted;
  // Higiene: nomes/títulos não vazios, limites de tamanho
  parsed.lists = parsed.lists
    .map((l) => ({
      ...l,
      name: l.name.trim().slice(0, 60),
      cards: l.cards.map((c) => ({ ...c, title: c.title.trim().slice(0, 200) })).filter((c) => c.title),
    }))
    .filter((l) => l.name);
  return parsed;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Compara o que a IA leu com o quadro atual e monta o plano: o que já existe e o que será criado. */
export async function planImport(userId: string, boardId: string, image: string): Promise<ImportPlan> {
  const board = await prisma.board.findFirst({
    where: { id: boardId, userId },
    include: { lists: { include: { cards: { where: { archivedAt: null }, select: { title: true } } } } },
  });
  if (!board) throw new ApiError(404, "Quadro não encontrado");

  const extracted = await extractFromImage(image);
  const existingTitles = new Set(board.lists.flatMap((l) => l.cards.map((c) => norm(c.title))));
  const seen = new Set<string>();

  const lists: ImportPlanList[] = extracted.lists.map((l) => {
    const match = board.lists.find((bl) => norm(bl.name) === norm(l.name));
    const cards: ImportPlanCard[] = l.cards.map((c) => {
      const key = norm(c.title);
      const exists = existingTitles.has(key) || seen.has(key);
      seen.add(key);
      return {
        title: c.title,
        priority: c.priority,
        estimatedMinutes: c.estimatedMinutes > 0 ? c.estimatedMinutes : null,
        done: c.done,
        exists,
      };
    });
    return {
      name: l.name,
      kind: l.kind,
      priority: l.priority,
      existingListId: match?.id ?? null,
      cards,
    };
  });

  return {
    boardId,
    lists,
    newLists: lists.filter((l) => !l.existingListId).length,
    newCards: lists.reduce((a, l) => a + l.cards.filter((c) => !c.exists && !c.done).length, 0),
    doneCards: lists.reduce((a, l) => a + l.cards.filter((c) => !c.exists && c.done).length, 0),
  };
}

/** Cria listas e tarefas que ainda não existem, conforme o plano revisado pelo usuário. */
export async function applyImport(
  userId: string,
  boardId: string,
  plan: ImportPlan,
  includeDone: boolean,
): Promise<{ lists: number; cards: number }> {
  const board = await prisma.board.findFirst({ where: { id: boardId, userId }, include: { lists: true } });
  if (!board) throw new ApiError(404, "Quadro não encontrado");
  if (plan.boardId !== boardId) throw new ApiError(400, "Plano de outro quadro");

  let listPos = Math.max(-1, ...board.lists.map((l) => l.position)) + 1;
  let createdLists = 0;
  let createdCards = 0;
  const doneList = board.lists.find((l) => l.kind === "done");
  const today = todayKey();

  for (const l of plan.lists) {
    let listId = l.existingListId && board.lists.some((bl) => bl.id === l.existingListId) ? l.existingListId : null;
    const cardsToCreate = l.cards.filter((c) => !c.exists && (includeDone || !c.done));
    if (!listId) {
      if (cardsToCreate.length === 0 && l.cards.length > 0) continue; // tudo já existe: não cria lista vazia
      const created = await prisma.list.create({
        data: { boardId, name: l.name.slice(0, 60), kind: l.kind, priority: l.priority, position: listPos++ },
      });
      listId = created.id;
      createdLists += 1;
    }
    const listKind = (board.lists.find((bl) => bl.id === listId)?.kind ?? l.kind) as ListKind;
    const max = await prisma.card.aggregate({ where: { listId }, _max: { position: true } });
    let pos = (max._max.position ?? -1) + 1;
    for (const c of cardsToCreate) {
      const targetListId: string = c.done && doneList ? doneList.id : listId;
      const targetKind = c.done && doneList ? "done" : listKind;
      await prisma.card.create({
        data: {
          listId: targetListId,
          title: c.title.slice(0, 200),
          priority: c.priority,
          estimatedMinutes: c.estimatedMinutes,
          position: targetListId === listId ? pos++ : 0,
          scheduledFor: targetKind === "tomorrow" ? tomorrowKey() : today,
          completedAt: targetKind === "done" || c.done ? new Date() : null,
        },
      });
      createdCards += 1;
    }
  }
  return { lists: createdLists, cards: createdCards };
}
