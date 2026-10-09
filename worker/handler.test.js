// Run with: npm run test:worker
import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, TOKEN_DAYS } from "./handler.js";

const env = { ADMIN_PASSWORD: "right horse battery" };
const SITE = "https://yawyawfootbaw.github.io";
const NOW = Date.UTC(2026, 9, 9);
const call = (method, path, auth, { origin = SITE, at = NOW, envOverride = env } = {}) => handle(
  new Request(`https://admin.example${path}`, { method, headers: { ...(auth != null && { Authorization: `Bearer ${auth}` }), Origin: origin } }),
  envOverride, "export const x = 1;", at);
const login = async (password = env.ADMIN_PASSWORD, opts) => call("POST", "/login", password, opts);
const tokenFor = async (opts) => (await (await login(env.ADMIN_PASSWORD, opts)).json()).token;

test("the right password gets a token that loads the code, with CORS for the site", async () => {
  const res = await login();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), SITE);
  const { token, expires } = await res.json();
  assert.equal(expires, NOW + TOKEN_DAYS * 86_400_000);
  assert.ok(!token.includes(env.ADMIN_PASSWORD));
  const code = await call("GET", "/admin.js", token);
  assert.equal(code.status, 200);
  assert.equal(await code.text(), "export const x = 1;");
  assert.equal(code.headers.get("Cache-Control"), "no-store");
});

test("a wrong or missing password gets no token", async () => {
  for (const password of ["nope", `${env.ADMIN_PASSWORD}x`, "", null]) {
    const res = await login(password);
    assert.equal(res.status, 401);
    assert.doesNotMatch(await res.text(), /token/);
  }
});

test("the password itself no longer loads the code; only a token does", async () => {
  assert.equal((await call("GET", "/admin.js", env.ADMIN_PASSWORD)).status, 401);
});

test("tokens expire, and changing the password cancels them", async () => {
  const token = await tokenFor();
  assert.equal((await call("GET", "/admin.js", token, { at: NOW + (TOKEN_DAYS - 1) * 86_400_000 })).status, 200);
  assert.equal((await call("GET", "/admin.js", token, { at: NOW + TOKEN_DAYS * 86_400_000 })).status, 401);
  assert.equal((await call("GET", "/admin.js", token, { envOverride: { ADMIN_PASSWORD: "new password" } })).status, 401);
});

test("a tampered token is refused", async () => {
  const [expires, sig] = (await tokenFor()).split(".");
  const later = String(Number(expires) + 365 * 86_400_000);
  for (const bad of [`${later}.${sig}`, `${expires}.${sig.replace(/^./, (c) => (c === "0" ? "1" : "0"))}`, "garbage", `${expires}.`]) {
    assert.equal((await call("GET", "/admin.js", bad)).status, 401, bad);
  }
});

test("no password configured means nobody gets in", async () => {
  assert.equal((await login("", { envOverride: {} })).status, 401);
});

test("preflight allows the Authorization header for the site and localhost only", async () => {
  const ok = await call("OPTIONS", "/login", null, { origin: "http://localhost:4173" });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("Access-Control-Allow-Headers"), "Authorization");
  const other = await call("OPTIONS", "/login", null, { origin: "https://evil.example" });
  assert.equal(other.headers.get("Access-Control-Allow-Origin"), null);
});

test("other paths and methods are 404", async () => {
  const token = await tokenFor();
  assert.equal((await call("GET", "/", token)).status, 404);
  assert.equal((await call("GET", "/login", env.ADMIN_PASSWORD)).status, 404);
});
