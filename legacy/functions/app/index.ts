// app: one function for everything that is not answers, checkout or the payment webhook.
//   /app/notify   emails: scheduled reminders, app events, confirmations, tests, unsubscribe links
//   /app/partner  the accountability partner, for readers and for partners following email links
//   /app/account  status, export (device-verified), cancel pass (pro rata refund inside 14 days),
//                 scheduled delete and undo, passkeys and emailed export codes
// Each route checks its own caller: a signed-in reader, a server secret, or a single-use email token.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handle as notify } from "./notify.ts";
import { handle as partner } from "./partner.ts";
import { handle as account } from "./account.ts";

Deno.serve((req) => {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const route = parts[parts.indexOf("app") + 1] ?? "";
  if (route === "notify") return notify(req);
  if (route === "partner") return partner(req);
  if (route === "account") return account(req);
  return new Response("Not found", { status: 404 });
});
