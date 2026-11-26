import { securityTxt } from "@/lib/security-txt";

/**
 * /.well-known/security.txt. Served on the marketplace host only: the proxy
 * answers 404 for it on a white-label host (lib/tenant-resolve.ts). Without
 * SECURITY_CONTACT the file does not exist.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const body = securityTxt();
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
