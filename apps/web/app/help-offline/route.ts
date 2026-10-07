import { offlineHelpHtml } from "@/lib/offline-help";

/**
 * /help-offline (F-140): the static Help now page the service worker keeps
 * for when the network or the app is down. Built once at build time from
 * the support lines, never per request, so it can hold nothing personal.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(offlineHelpHtml(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
