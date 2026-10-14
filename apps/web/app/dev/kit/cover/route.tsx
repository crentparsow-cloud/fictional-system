import { ImageResponse } from "next/og";
import { DIRECTIONS, SHELF_IDS, isDirectionId, type ShelfId } from "@/lib/design/directions";
import { coverFonts } from "@/lib/design/cover-fonts";
import { CoverArt } from "@/lib/design/cover-render";
import { COVER_FORMATS, COVER_UNITS, type CoverFormat, type CoverSpec } from "@/lib/design/cover-spec";
import { activeDirection } from "@/lib/design/active";
import { kitAllowedForRoute } from "@/lib/design/kit-gate";

/**
 * A sample cover for /dev/kit, in any of the three directions and either
 * scheme, from sample words. No workbook data. Same gate as the page.
 */
const SAMPLE_LABEL: Record<CoverFormat, string> = { w4: "4 weeks", w8: "8 weeks", w12: "12 weeks", collection: "Collection", start: "Start here" };

export async function GET(request: Request) {
  if (!(await kitAllowedForRoute())) return new Response("Not found", { status: 404 });
  const q = new URL(request.url).searchParams;
  const direction = isDirectionId(q.get("direction")) ? DIRECTIONS[q.get("direction") as keyof typeof DIRECTIONS] : activeDirection;
  const format = (COVER_FORMATS as readonly string[]).includes(q.get("format") ?? "") ? (q.get("format") as CoverFormat) : "w12";
  const shelf = (SHELF_IDS as readonly string[]).includes(q.get("shelf") ?? "") ? (q.get("shelf") as ShelfId) : "mind-and-mood";
  const scheme = q.get("scheme") === "dark" ? "dark" : "light";
  const width = Math.min(480, Math.max(120, Number(q.get("w")) || 240));
  const spec: CoverSpec = {
    format,
    label: SAMPLE_LABEL[format],
    title: "Rebuilding from Empty",
    author: "Sample author",
    preview: "Small steps back to steady ground",
    shelfId: shelf,
  };
  return new ImageResponse(<CoverArt spec={spec} direction={direction} width={width} scheme={scheme} />, {
    width,
    height: Math.round((width * COVER_UNITS.h) / COVER_UNITS.w),
    fonts: coverFonts(direction),
    headers: { "Cache-Control": "no-store" },
  });
}
