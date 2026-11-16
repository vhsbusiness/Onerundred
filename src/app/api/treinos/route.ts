import { json, readBody, withAccess } from "@/lib/api";
import { listTraining, createTraining } from "@/lib/training";

export const POST = withAccess("training", async (user, req: Request) => json(await createTraining(user.id, await readBody(req)), { status: 201 }));

export const GET = withAccess("training", async user => json(await listTraining(user.id)));
