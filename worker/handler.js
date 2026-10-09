// The admin login and the admin code, so regular visitors never get the admin code and the password never has to be
// kept in a browser. Split from index.js so it can be tested in Node, where admin.js can't be imported as text.
//
//   POST /login     Authorization: Bearer <password>  ->  { token }, good for TOKEN_DAYS
//   GET  /admin.js  Authorization: Bearer <token>     ->  the admin module
//
// Tokens are signed with the password, so changing the password (wrangler secret put ADMIN_PASSWORD) signs everyone
// out at once.

const ORIGINS = ["https://yawyawfootbaw.github.io", "http://localhost:4173"];
export const TOKEN_DAYS = 30;

/**
 * @param {Request} request
 * @param {{ ADMIN_PASSWORD?: string }} env  the password is a Worker secret
 * @param {string} code  admin.js's source
 * @param {number} [now]  for tests
 */
export async function handle(request, env, code, now = Date.now()) {
  const origin = request.headers.get("Origin");
  const cors = ORIGINS.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization", "Access-Control-Allow-Methods": "GET, POST", Vary: "Origin" }
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
  return reply("Not found", 404);
}

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
