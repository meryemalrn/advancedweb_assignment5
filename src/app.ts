// STUDENT NAME, STUDENT NUMBER
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db.ts";
import { users } from "./schema.ts";
import {
  checkPassword,
  createSession,
  type Env,
  hashPassword,
  requireAuth,
} from "./auth.ts";
import { parseBody } from "./validate.ts";

const Credentials = z.object({
  email: z.email().transform((s) => s.toLowerCase()),
  password: z.string().min(8, "Password must have at least 8 characters"),
});

// A real bcrypt hash of a random string. Login compares against it when the email is
// unknown, so a wrong email takes as long as a wrong password (no timing leak).
const dummyHash = hashPassword(crypto.randomUUID());

/** Build the whole application around a database, so tests can give it their own. */
export function createApp(db: Db) {
  const app = new Hono<Env>();

  // Worked example: a health check.
  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/auth/register", async (c) => {
    const body = await parseBody(c, Credentials);
    if (!body.ok) return body.res;
    const { email, password } = body.data;

    // The UNIQUE constraint decides, so two parallel registrations cannot both win.
    const [user] = await db.db.insert(users)
      .values({ email, passwordHash: await hashPassword(password) })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, email: users.email });
    if (!user) return c.json({ error: "email already registered" }, 409);
    return c.json(user, 201);
  });

  app.post("/auth/login", async (c) => {
    const body = await parseBody(c, Credentials);
    if (!body.ok) return body.res;
    const { email, password } = body.data;

    const [user] = await db.db.select().from(users).where(eq(users.email, email));
    const ok = await checkPassword(password, user?.passwordHash ?? await dummyHash);
    if (!user || !ok) return c.json({ error: "invalid email or password" }, 401);
    return c.json({ token: await createSession(db, user.id) });
  });

  // Every /api route needs a valid token.
  app.use("/api/*", requireAuth(db));

  // TODO R4: GET/POST /api/tasks and GET/PUT/DELETE /api/tasks/:id, only for the owner.

  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((err, c) => {
    console.error(err); // details go to the log, not to the client
    return c.json({ error: "internal error" }, 500);
  });
  return app;
}
