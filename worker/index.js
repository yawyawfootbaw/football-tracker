// Cloudflare Worker entry point. admin.js is bundled as text (see rules in wrangler.toml), not run here.

import code from "./admin.js";
import { handle } from "./handler.js";

export default {
  fetch: (request, env) => handle(request, env, code),
};
