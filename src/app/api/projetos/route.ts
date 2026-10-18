import { ApiError, json, optionalDayKey, readBody, requireString, withUser } from "@/lib/api";
import { createProject, listProjects } from "@/lib/projects";
import { todayKey } from "@/lib/time";

export const GET = withUser(async (user) => json(await listProjects(user.id)));

export const POST = withUser(async (user, req: Request) => {
  const body = await readBody(req);
  const days = Number(body.days);
  if (!Number.isInteger(days)) throw new ApiError(400, "Duração em dias inválida");
  const project = await createProject(user.id, {
    name: requireString(body.name, "name"),
    description: typeof body.description === "string" ? body.description : "",
    obligations: typeof body.obligations === "string" ? body.obligations : "",
    startDate: optionalDayKey(body.startDate) ?? todayKey(),
    days,
  });
  return json(project, { status: 201 });
});
