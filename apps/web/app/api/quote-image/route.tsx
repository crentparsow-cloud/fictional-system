import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";
import { activeDirection } from "@/lib/design/active";
import { coverFonts } from "@/lib/design/cover-fonts";
import { COVER_FONT_FAMILIES } from "@/lib/design/cover-render";
import { verifyQuote } from "@/lib/share/quote";
import { countEvent } from "@/lib/funnel-server";

/**
 * A quote image (12.3): GET /api/quote-image?w=<slug>&l=<line>&s=<signature>.
 *
 * It draws one line of a workbook's own text, in the active design
 * direction, and nothing else: no title, no author, no reader. The line must
 * carry the signature the server made for exactly that workbook and line
 * (lib/share/quote.ts), so the route cannot print other words. With
 * QUOTE_IMAGE_SECRET blank it answers 404 for everything. The same address
 * always gives the same picture, so it is cached for a year.
 */
export const dynamic = "force-dynamic";

const SIZE = 1080;

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const secret = process.env.QUOTE_IMAGE_SECRET ?? "";
  const q = new URL(request.url).searchParams;
  const slug = q.get("w") ?? "";
  const line = q.get("l") ?? "";
  const sig = q.get("s") ?? "";
  if (!secret || !verifyQuote(secret, slug, line, sig)) return notFound();

  await countEvent("quote_image_made");
  const p = activeDirection.light;
  const size = line.length > 140 ? 52 : line.length > 90 ? 62 : 74;
  const flex = { display: "flex" } as const;
  return new ImageResponse(
    (
      <div style={{ ...flex, width: "100%", height: "100%", background: p.canvas, color: p.ink, padding: "96px", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ ...flex, width: 96, height: 10, background: p["brand-text"] }} />
        <div style={{ ...flex, fontFamily: COVER_FONT_FAMILIES.serif, fontWeight: 700, fontSize: size, lineHeight: 1.22 }}>{`“${line}”`}</div>
        <div style={{ ...flex, fontFamily: COVER_FONT_FAMILIES.sans, fontWeight: 600, fontSize: 30, color: p["ink-soft"] }}>{brand.name}</div>
      </div>
    ),
    {
      width: SIZE,
      height: SIZE,
      fonts: coverFonts(activeDirection),
      headers: { "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    },
  );
}
