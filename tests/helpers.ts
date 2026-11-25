// STUDENT NAME, STUDENT NUMBER
import { createApp } from "../src/app.ts";
import { createDb, migrate } from "../src/db.ts";

export type App = ReturnType<typeof createApp>;

/**
 * A fresh, empty, migrated database in its own temporary file.
 * (An in-memory database loses its tables after a transaction with libSQL,
 * so a temporary file is the safe choice.)
 */
export async function freshDb() {
  const file = await Deno.makeTempFile({ suffix: ".db" });
  const db = createDb(`file:${file}`);
  await migrate(db);
  return db;
}

/** Every test gets a fresh app on its own empty database. */
export async function freshApp() {
  return createApp(await freshDb());
}

/** Send a JSON request, with a Bearer token when one is given. */
export function send(
  app: App,
  method: string,
  path: string,
  opts: { body?: unknown; token?: string } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return app.request(path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

/** Register a user and log in; returns the token. */
export async function userToken(
  app: App,
  email = "a@example.com",
  password = "secret123",
) {
  await send(app, "POST", "/auth/register", { body: { email, password } });
  const res = await send(app, "POST", "/auth/login", { body: { email, password } });
  const { token } = await res.json();
  return token as string;
}
