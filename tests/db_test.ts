// STUDENT NAME, STUDENT NUMBER
import { assertEquals, assertRejects } from "@std/assert";
import { eq } from "drizzle-orm";
import { tasks, users } from "../src/schema.ts";
import { freshDb } from "./helpers.ts";

Deno.test("a task row can be inserted through Drizzle and read back with its defaults", async () => {
  const { db } = await freshDb();
  const [user] = await db.insert(users)
    .values({ email: "a@example.com", passwordHash: "x" }).returning();

  await db.insert(tasks).values({ userId: user.id, title: "Write step 2" });
  const [task] = await db.select().from(tasks).where(eq(tasks.userId, user.id));

  assertEquals(task.title, "Write step 2");
  assertEquals(task.status, "todo"); // SQL default
  assertEquals(task.priority, "medium"); // SQL default
  assertEquals(task.description, null);
  assertEquals(typeof task.createdAt, "number"); // set by the database, not by JS
});

Deno.test("the database itself refuses a status outside the three allowed values", async () => {
  const { client } = await freshDb();
  await client.execute(
    "INSERT INTO users (email, password_hash) VALUES ('b@example.com', 'x')",
  );
  await assertRejects(() =>
    client.execute(
      "INSERT INTO tasks (user_id, title, status) VALUES (1, 'bad', 'finished')",
    )
  );
});
