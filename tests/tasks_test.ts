// STUDENT NAME, STUDENT NUMBER
import { assertEquals } from "@std/assert";
import { type App, freshApp, send, userToken } from "./helpers.ts";

async function makeTask(app: App, token: string, body: Record<string, unknown>) {
  const res = await send(app, "POST", "/api/tasks", { token, body });
  assertEquals(res.status, 201);
  return await res.json();
}

Deno.test("create a task: 201, defaults filled in, owner from the token", async () => {
  const app = await freshApp();
  const token = await userToken(app);
  const task = await makeTask(app, token, { title: "  Buy milk  ", userId: 999 });
  assertEquals(task.title, "Buy milk"); // trimmed
  assertEquals(task.status, "todo");
  assertEquals(task.priority, "medium");
  assertEquals(task.userId, 1); // the userId in the body was ignored
});

Deno.test("read, update and delete my own task", async () => {
  const app = await freshApp();
  const token = await userToken(app);
  const { id } = await makeTask(app, token, { title: "Draft" });

  const got = await send(app, "GET", `/api/tasks/${id}`, { token });
  assertEquals(got.status, 200);
  assertEquals((await got.json()).title, "Draft");

  const put = await send(app, "PUT", `/api/tasks/${id}`, {
    token,
    body: { title: "Final", status: "done", priority: "high" },
  });
  assertEquals(put.status, 200);
  const updated = await put.json();
  assertEquals([updated.title, updated.status, updated.priority], [
    "Final",
    "done",
    "high",
  ]);

  const del = await send(app, "DELETE", `/api/tasks/${id}`, { token });
  assertEquals(await del.json(), { ok: true });
  assertEquals((await send(app, "GET", `/api/tasks/${id}`, { token })).status, 404);
});

Deno.test("user B cannot read, change, delete or list user A's task (404)", async () => {
  const app = await freshApp();
  const a = await userToken(app, "a@example.com");
  const b = await userToken(app, "b@example.com");
  const { id } = await makeTask(app, a, { title: "A's secret" });

  for (const method of ["GET", "PUT", "DELETE"]) {
    const res = await send(app, method, `/api/tasks/${id}`, {
      token: b,
      body: method === "PUT" ? { title: "hacked" } : undefined,
    });
    assertEquals(res.status, 404, method);
    assertEquals((await res.json()).error, "not found");
  }
  const list = await (await send(app, "GET", "/api/tasks", { token: b })).json();
  assertEquals(list.total, 0);

  // and A's task is unchanged
  const mine = await (await send(app, "GET", `/api/tasks/${id}`, { token: a })).json();
  assertEquals(mine.title, "A's secret");
});

Deno.test("an invalid status or an empty title is 400 with issues", async () => {
  const app = await freshApp();
  const token = await userToken(app);
  const res = await send(app, "POST", "/api/tasks", {
    token,
    body: { title: "", status: "finished" },
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "validation failed");
  const paths = body.issues.map((i: { path: string[] }) => i.path[0]).sort();
  assertEquals(paths, ["status", "title"]);
});

Deno.test("a task id that is not a number is 404, not a crash", async () => {
  const app = await freshApp();
  const token = await userToken(app);
  const res = await send(app, "GET", "/api/tasks/abc", { token });
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error, "not found");
});

Deno.test("pagination: 3 tasks, page 2 with limit 2 holds the third one", async () => {
  const app = await freshApp();
  const token = await userToken(app);
  for (const title of ["one", "two", "three"]) await makeTask(app, token, { title });

  const res = await send(app, "GET", "/api/tasks?page=2&limit=2", { token });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.page, 2);
  assertEquals(body.limit, 2);
  assertEquals(body.total, 3);
  assertEquals(body.items.map((t: { title: string }) => t.title), ["three"]);
});

Deno.test("list defaults to page 1, limit 20, and filters by status", async () => {
  const app = await freshApp();
  const token = await userToken(app);
  await makeTask(app, token, { title: "open" });
  await makeTask(app, token, { title: "closed", status: "done" });

  const all = await (await send(app, "GET", "/api/tasks", { token })).json();
  assertEquals([all.page, all.limit, all.total], [1, 20, 2]);

  const done = await (await send(app, "GET", "/api/tasks?status=done", { token })).json();
  assertEquals(done.total, 1);
  assertEquals(done.items[0].title, "closed");
});

Deno.test("bad query values (page=abc, limit=1000, status=x) are 400", async () => {
  const app = await freshApp();
  const token = await userToken(app);
  for (const qs of ["page=abc", "limit=1000", "page=0", "status=x"]) {
    const res = await send(app, "GET", `/api/tasks?${qs}`, { token });
    assertEquals(res.status, 400, qs);
    assertEquals((await res.json()).error, "validation failed");
  }
});

Deno.test("an unknown route answers 404 in the error shape", async () => {
  const app = await freshApp();
  const res = await app.request("/nope");
  assertEquals(res.status, 404);
  assertEquals(await res.json(), { error: "not found" });
});
