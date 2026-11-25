// STUDENT NAME, STUDENT NUMBER
import type { Context } from "hono";
import { z } from "zod";

/** The one error shape of this API: every failure answers { error, issues? }. */
export type Issue = { path: PropertyKey[]; message: string };
export type ErrorBody = { error: string; issues?: Issue[] };

const toIssues = (error: z.ZodError): Issue[] =>
  error.issues.map((i) => ({ path: i.path, message: i.message }));

type Result<T> = { ok: true; data: T } | { ok: false; res: Response };

const fail = (c: Context, issues: Issue[]): Result<never> => ({
  ok: false,
  res: c.json({ error: "validation failed", issues } satisfies ErrorBody, 400),
});

/** Parse the JSON body with a schema. Bad JSON and a wrong shape are both a 400. */
export async function parseBody<S extends z.ZodType>(
  c: Context,
  schema: S,
): Promise<Result<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return fail(c, [{ path: [], message: "Body must be valid JSON" }]);
  }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : fail(c, toIssues(parsed.error));
}

/** Parse the query string with a schema (values arrive as text, so use z.coerce). */
export function parseQuery<S extends z.ZodType>(
  c: Context,
  schema: S,
): Result<z.infer<S>> {
  const parsed = schema.safeParse(c.req.query());
  return parsed.success
    ? { ok: true, data: parsed.data }
    : fail(c, toIssues(parsed.error));
}
