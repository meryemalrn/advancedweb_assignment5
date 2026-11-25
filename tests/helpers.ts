// STUDENT NAME, STUDENT NUMBER
import { createApp } from "../src/app.ts";
import { createDb, migrate } from "../src/db.ts";

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
