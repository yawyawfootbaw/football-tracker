// Run with: npm run test:worker
import { test } from "node:test";
import assert from "node:assert/strict";
import { handle } from "./handler.js";

const env = { ADMIN_PASSWORD: "right horse battery" };
const get = (headers = {}, path = "/admin.js", method = "GET") =>
  handle(new Request(`https://admin.example${path}`, { method, headers }), env, "export const x = 1;");
const SITE = "https://yawyawfootbaw.github.io";

test("the right password gets the code, with CORS for the site", async () => {
  const res = await get({ Authorization: `Bearer ${env.ADMIN_PASSWORD}`, Origin: SITE });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "export const x = 1;");
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), SITE);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("a wrong or missing password gets 401 and no code", async () => {
  for (const headers of [{ Authorization: "Bearer nope" }, { Authorization: `Bearer ${env.ADMIN_PASSWORD}x` }, {}]) {
    const res = await get({ ...headers, Origin: SITE });
    assert.equal(res.status, 401);
    assert.doesNotMatch(await res.text(), /export/);
  }
});

test("no password configured means nobody gets in", async () => {
  const res = await handle(new Request("https://admin.example/admin.js", { headers: { Authorization: "Bearer " } }), {}, "code");
  assert.equal(res.status, 401);
});

test("preflight allows the Authorization header for the site and localhost only", async () => {
  const ok = await get({ Origin: "http://localhost:4173" }, "/admin.js", "OPTIONS");
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("Access-Control-Allow-Headers"), "Authorization");
  const other = await get({ Origin: "https://evil.example" }, "/admin.js", "OPTIONS");
  assert.equal(other.headers.get("Access-Control-Allow-Origin"), null);
});

test("other paths are 404", async () => {
  assert.equal((await get({ Authorization: `Bearer ${env.ADMIN_PASSWORD}` }, "/")).status, 404);
});
