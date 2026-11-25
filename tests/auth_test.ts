// STUDENT NAME, STUDENT NUMBER
import { assert, assertEquals } from "@std/assert";
import { freshApp, send } from "./helpers.ts";

const alice = { email: "alice@example.com", password: "secret123" };

Deno.test("register answers 201 with id and email, never the hash", async () => {
  const app = await freshApp();
  const res = await send(app, "POST", "/auth/register", { body: alice });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(Object.keys(body).sort(), ["email", "id"]);
  assertEquals(body.email, alice.email);
});

Deno.test("register with a taken email is 409, also with other letter case", async () => {
  const app = await freshApp();
  await send(app, "POST", "/auth/register", { body: alice });
  const res = await send(app, "POST", "/auth/register", {
    body: { ...alice, email: "ALICE@example.com" },
  });
  assertEquals(res.status, 409);
  assertEquals((await res.json()).error, "email already registered");
});

Deno.test("register with a bad email and a short password is 400 with both issues", async () => {
  const app = await freshApp();
  const res = await send(app, "POST", "/auth/register", {
    body: { email: "not-an-email", password: "short" },
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "validation failed");
  const paths = body.issues.map((i: { path: string[] }) => i.path[0]).sort();
  assertEquals(paths, ["email", "password"]);
});

Deno.test("a body that is not JSON is a 400 in the same shape", async () => {
  const app = await freshApp();
  const res = await app.request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{oops",
  });
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "validation failed");
});

Deno.test("login with the right password returns a token", async () => {
  const app = await freshApp();
  await send(app, "POST", "/auth/register", { body: alice });
  const res = await send(app, "POST", "/auth/login", { body: alice });
  assertEquals(res.status, 200);
  const { token } = await res.json();
  assert(typeof token === "string" && token.length > 20);
});

Deno.test("a wrong password and an unknown email give the same 401", async () => {
  const app = await freshApp();
  await send(app, "POST", "/auth/register", { body: alice });
  const wrongPw = await send(app, "POST", "/auth/login", {
    body: { ...alice, password: "wrong-password" },
  });
  const noUser = await send(app, "POST", "/auth/login", {
    body: { email: "nobody@example.com", password: "secret123" },
  });
  assertEquals(wrongPw.status, 401);
  assertEquals(noUser.status, 401);
  assertEquals(await wrongPw.json(), await noUser.json());
});

Deno.test("an /api route without a token, or with a made-up one, is 401", async () => {
  const app = await freshApp();
  const none = await send(app, "GET", "/api/tasks");
  const fake = await send(app, "GET", "/api/tasks", { token: "made-up-token" });
  assertEquals(none.status, 401);
  assertEquals(fake.status, 401);
  assertEquals((await fake.json()).error, "unauthorized");
});
