// F-125: fail the build if anyone adds a script origin to the Content Security
// Policy beyond the allow list below. Stripe's hosted checkout is the only
// third-party script Akana loads, and only on checkout routes.
import { readFileSync } from "node:fs";

const ALLOWED = new Set(["'self'", "'unsafe-inline'", "https://js.stripe.com"]);
const cfg = readFileSync(new URL("../apps/web/next.config.ts", import.meta.url), "utf8");
const match = /"script-src ([^"]+)"/.exec(cfg);
if (!match) {
  console.error("script-src directive not found in next.config.ts");
  process.exit(1);
}
const extra = match[1].split(/\s+/).filter((s) => s && !ALLOWED.has(s));
if (extra.length) {
  console.error("new script origin in CSP, not allowed:", extra.join(" "));
  process.exit(1);
}
console.log("CSP script-src is clean");
