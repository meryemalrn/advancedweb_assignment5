// STUDENT NAME, STUDENT NUMBER
import { Hono } from "hono";
import { and, asc, count, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db.ts";
import type { Env } from "./auth.ts";
import { PRIORITIES, STATUSES, tasks } from "./schema.ts";
import { parseBody, parseQuery } from "./validate.ts";

/** POST and PUT share one body. Unknown keys (like userId) are dropped by Zod. */
export const TaskBody = z.object({
  title: z.string().trim().min(1, "Title is required").max(100),
  description: z.string().trim().max(500).nullable().optional(),
  status: z.enum(STATUSES).default("todo"),
  priority: z.enum(PRIORITIES).default("medium"),
});

export const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(STATUSES).optional(),
});

const Id = z.coerce.number().int().positive();

/** The ownership rule in one place: this id AND this owner. */
const own = (id: number, userId: number) =>
  and(eq(tasks.id, id), eq(tasks.userId, userId));

/** The task routes, mounted under /api/tasks behind requireAuth. */
export function taskRoutes({ db }: Db) {
  const r = new Hono<Env>();
  const notFound = { error: "not found" } as const;

  r.get("/", async (c) => {
    const q = parseQuery(c, ListQuery);
    if (!q.ok) return q.res;
    const { page, limit, status } = q.data;

    // The same filter for the page and for the total.
    const filters: SQL[] = [eq(tasks.userId, c.get("userId"))];
    if (status) filters.push(eq(tasks.status, status));
    const where = and(...filters);

    const items = await db.select().from(tasks).where(where)
      .orderBy(asc(tasks.id)).limit(limit).offset((page - 1) * limit);
    const [{ total }] = await db.select({ total: count() }).from(tasks).where(where);
    return c.json({ items, page, limit, total });
  });

  r.post("/", async (c) => {
    const body = await parseBody(c, TaskBody);
    if (!body.ok) return body.res;
    const [task] = await db.insert(tasks)
      .values({ ...body.data, userId: c.get("userId") }).returning();
    return c.json(task, 201);
  });

  r.get("/:id", async (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success) return c.json(notFound, 404);
    const [task] = await db.select().from(tasks).where(own(id.data, c.get("userId")));
    return task ? c.json(task) : c.json(notFound, 404);
  });

  r.put("/:id", async (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success) return c.json(notFound, 404);
    const body = await parseBody(c, TaskBody);
    if (!body.ok) return body.res;
    const [task] = await db.update(tasks).set(body.data)
      .where(own(id.data, c.get("userId"))).returning();
    return task ? c.json(task) : c.json(notFound, 404);
  });

  r.delete("/:id", async (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success) return c.json(notFound, 404);
    const deleted = await db.delete(tasks)
      .where(own(id.data, c.get("userId"))).returning({ id: tasks.id });
    return deleted.length ? c.json({ ok: true }) : c.json(notFound, 404);
  });

  return r;
}
