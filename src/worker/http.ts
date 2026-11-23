import type { z } from "zod";

export async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T> | Response> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (parsed.success) return parsed.data;
  return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(", ") }, { status: 400 });
}
