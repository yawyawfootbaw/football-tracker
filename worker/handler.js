// The admin login and the admin code, so regular visitors never get the admin code and the password never has to be
// kept in a browser. Split from index.js so it can be tested in Node, where admin.js can't be imported as text.
//
//   POST /login     Authorization: Bearer <password>  ->  { token }, good for TOKEN_DAYS
//   GET  /admin.js  Authorization: Bearer <token>     ->  the admin module
//   POST /imgur     Authorization: Bearer <token>, a PNG body  ->  { link, deletehash }, uploaded to Imgur
//                   anonymously with the IMGUR_CLIENT_ID secret
//
// Tokens are signed with the password, so changing the password (wrangler secret put ADMIN_PASSWORD) signs everyone
// out at once.

const ORIGINS = ["https://yawyawfootbaw.github.io", "http://localhost:4173"];
export const TOKEN_DAYS = 30;

/**
 * @param {Request} request
 * @param {{ ADMIN_PASSWORD?: string, IMGUR_CLIENT_ID?: string }} env  Worker secrets
 * @param {string} code  admin.js's source
 * @param {number} [now]  for tests
 * @param {typeof fetch} [fetchImpl]  for tests: stands in for Imgur
 */
export async function handle(request, env, code, now = Date.now(), fetchImpl = fetch) {
  const origin = request.headers.get("Origin");
  const cors = ORIGINS.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST", Vary: "Origin" }
    : {};
  const reply = (body, status, headers = {}) => new Response(body, { status, headers: { ...cors, ...headers } });
  if (request.method === "OPTIONS") return reply(null, 204);
  const route = `${request.method} ${new URL(request.url).pathname}`;
  const given = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  if (!env.ADMIN_PASSWORD) return reply("Not set up", 401);  // no password configured: nobody gets in

  if (route === "POST /login") {
    if (!(await sameText(given, env.ADMIN_PASSWORD))) return reply("Wrong password", 401);
    const expires = now + TOKEN_DAYS * 86_400_000;
    const token = `${expires}.${await sign(String(expires), env.ADMIN_PASSWORD)}`;
    return reply(JSON.stringify({ token, expires }), 200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  }
  if (route === "GET /admin.js") {
    if (!(await validToken(given, env.ADMIN_PASSWORD, now))) return reply("Log in again", 401);
    return reply(code, 200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
  }
  if (route === "POST /imgur") {
    if (!(await validToken(given, env.ADMIN_PASSWORD, now))) return reply("Log in again", 401);
    if (!env.IMGUR_CLIENT_ID) return reply(JSON.stringify({ error: "Imgur isn't set up (IMGUR_CLIENT_ID)" }), 503, JSON_TYPE);
    const png = await request.arrayBuffer();
    if (!png.byteLength || png.byteLength > IMGUR_MAX_BYTES) return reply(JSON.stringify({ error: "Image is empty or over 10 MB" }), 413, JSON_TYPE);
    const form = new FormData();
    form.append("image", new Blob([png], { type: "image/png" }), "game-tracker.png");
    form.append("type", "file");
    const res = await fetchImpl("https://api.imgur.com/3/image", { method: "POST", headers: { Authorization: `Client-ID ${env.IMGUR_CLIENT_ID}` }, body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) return reply(JSON.stringify({ error: json.data?.error ?? `Imgur answered ${res.status}` }), 502, JSON_TYPE);
    return reply(JSON.stringify({ link: json.data.link, deletehash: json.data.deletehash }), 200, JSON_TYPE);
  }
  return reply("Not found", 404);
}

const JSON_TYPE = { "Content-Type": "application/json" };
const IMGUR_MAX_BYTES = 10 * 1024 * 1024;  // Imgur's limit for an image

const encode = (s) => new TextEncoder().encode(s);
const hmacKey = (password) =>
  crypto.subtle.importKey("raw", encode(`football-tracker-admin:${password}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sign(text, password) {
  return toHex(await crypto.subtle.sign("HMAC", await hmacKey(password), encode(text)));
}

// "<expires>.<signature>", unexpired and signed with the current password. verify() compares in constant time.
async function validToken(token, password, now) {
  const [expires, sig] = token.split(".");
  if (!/^\d+$/.test(expires ?? "") || !/^[0-9a-f]{64}$/.test(sig ?? "") || Number(expires) <= now) return false;
  const bytes = new Uint8Array(sig.match(/../g).map((h) => parseInt(h, 16)));
  return crypto.subtle.verify("HMAC", await hmacKey(password), bytes, encode(expires));
}

// Compares hashes byte by byte without stopping early, so response timing doesn't reveal how much of a guess was right.
async function sameText(a, b) {
  const hash = async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", encode(s)));
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  return x.reduce((diff, byte, i) => diff | (byte ^ y[i]), 0) === 0;
}
