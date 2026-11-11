import { json, readBody, withUser } from "@/lib/api";
import { createTraining } from "@/lib/training";

export const POST = withUser(async (user, req: Request) => json(await createTraining(user.id, await readBody(req)), { status: 201 }));
