// Serves the admin module (admin.js) only to requests carrying the admin password, so regular visitors never get the
// admin code. Split from index.js so it can be tested in Node, where admin.js can't be imported as text.

const ORIGINS = ["https://yawyawfootbaw.github.io", "http://localhost:4173"];

/**
 * @param {Request} request
 * @param {{ ADMIN_PASSWORD?: string }} env  the password is a Worker secret (wrangler secret put ADMIN_PASSWORD)
 * @param {string} code  admin.js's source
 */
export async function handle(request, env, code) {
  const origin = request.headers.get("Origin");
  const cors = ORIGINS.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization", "Access-Control-Allow-Methods": "GET", Vary: "Origin" }
    : {};
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "GET" || new URL(request.url).pathname !== "/admin.js") return new Response("Not found", { status: 404, headers: cors });
  const given = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  if (!env.ADMIN_PASSWORD || !(await sameText(given, env.ADMIN_PASSWORD))) {
    return new Response("Wrong password", { status: 401, headers: cors });
  }
  return new Response(code, { headers: { ...cors, "Content-Type": "text/javascript", "Cache-Control": "no-store" } });
}

// Compares hashes byte by byte without stopping early, so response timing doesn't reveal how much of a guess was right.
async function sameText(a, b) {
  const hash = async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  return x.reduce((diff, byte, i) => diff | (byte ^ y[i]), 0) === 0;
}
