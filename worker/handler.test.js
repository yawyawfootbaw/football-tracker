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
  assert.equal(ok.headers.get("Access-Control-Allow-Headers"), "Authorization, Content-Type");
  const other = await call("OPTIONS", "/login", null, { origin: "https://evil.example" });
  assert.equal(other.headers.get("Access-Control-Allow-Origin"), null);
});

const imgurEnv = { ...env, IMGUR_CLIENT_ID: "client-123" };
const upload = async (token, { envOverride = imgurEnv, imgur, body = new Uint8Array([137, 80, 78, 71]) } = {}) => {
  const sent = [];
  const fakeImgur = async (url, init) => {
    sent.push({ url, init });
    return imgur ?? Response.json({ success: true, data: { link: "https://i.imgur.com/abc.png", deletehash: "xyz" } });
  };
  const req = new Request("https://admin.example/imgur", { method: "POST", body, headers: { Authorization: `Bearer ${token}`, Origin: SITE } });
  return { res: await handle(req, envOverride, "", NOW, fakeImgur), sent };
};

test("Imgur: a logged-in admin's PNG goes up anonymously with the Client-ID, and the link comes back", async () => {
  const { res, sent } = await upload(await tokenFor());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { link: "https://i.imgur.com/abc.png", deletehash: "xyz" });
  assert.equal(sent[0].url, "https://api.imgur.com/3/image");
  assert.equal(sent[0].init.headers.Authorization, "Client-ID client-123");
  const image = sent[0].init.body.get("image");
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), new Uint8Array([137, 80, 78, 71]));
});

test("Imgur: no token, no Client-ID, an empty body, or an Imgur error never reach a link", async () => {
  assert.equal((await upload(env.ADMIN_PASSWORD)).res.status, 401);  // the password isn't a token
  const noId = await upload(await tokenFor(), { envOverride: env });
  assert.equal(noId.res.status, 503);
  assert.equal(noId.sent.length, 0);
  assert.equal((await upload(await tokenFor(), { body: new Uint8Array() })).res.status, 413);
  const refused = await upload(await tokenFor(), { imgur: Response.json({ success: false, data: { error: "Rate limited" } }, { status: 429 }) });
  assert.equal(refused.res.status, 502);
  assert.deepEqual(await refused.res.json(), { error: "Rate limited" });
});

test("other paths and methods are 404", async () => {
  const token = await tokenFor();
  assert.equal((await call("GET", "/", token)).status, 404);
  assert.equal((await call("GET", "/login", env.ADMIN_PASSWORD)).status, 404);
});
