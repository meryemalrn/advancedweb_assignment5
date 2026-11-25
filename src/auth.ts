// STUDENT NAME, STUDENT NUMBER
import bcrypt from "bcryptjs";
import type { MiddlewareHandler } from "hono";
import type { Db } from "./db.ts";

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const checkPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

const SESSION_SECONDS = 60 * 60; // a session lives for one hour

/** Log a user in: store a random token for them and return it. */
export async function createSession(db: Db, userId: number): Promise<string> {
  const token = crypto.randomUUID();
  await db.client.execute({
    sql:
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, strftime('%s','now') + ?)",
    args: [token, userId, SESSION_SECONDS],
  });
  return token;
}

/** Return the user id that owns a valid, unexpired token, or null. */
export async function userIdFromToken(db: Db, token: string): Promise<number | null> {
  const res = await db.client.execute({
    sql:
      "SELECT user_id FROM sessions WHERE token = ? AND expires_at > strftime('%s','now')",
    args: [token],
  });
  const id = res.rows[0]?.user_id;
  return id === undefined ? null : Number(id);
}

/** The variables a route can read after requireAuth ran. */
export type Env = { Variables: { userId: number } };

/** Read the token from "Authorization: Bearer <token>", or "" when there is none. */
export function bearerToken(header: string | undefined): string {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return match ? match[1] : "";
}

/**
 * Middleware factory: it needs the database to look the token up, so it takes `db`
 * and returns the middleware. A missing, unknown or expired token stops with 401.
 */
export const requireAuth = (db: Db): MiddlewareHandler<Env> => async (c, next) => {
  const token = bearerToken(c.req.header("authorization"));
  const id = token ? await userIdFromToken(db, token) : null;
  if (id === null) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", id);
  await next();
};
