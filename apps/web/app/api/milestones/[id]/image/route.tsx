import { ImageResponse } from "next/og";
import { NO_STORE, OG_SIZE } from "@/lib/cache-headers";
import { brand } from "@/lib/brand";
import { getReaderSession } from "@/lib/auth";
import { activeDirection } from "@/lib/design/active";
import { coverFonts } from "@/lib/design/cover-fonts";
import { COVER_FONT_FAMILIES } from "@/lib/design/cover-render";
import { isMilestoneKind, MILESTONE_COPY } from "@/lib/habit/milestones";
import { createUserClient } from "@/lib/supabase/server";

/**
 * The picture for a milestone mark (4.5): GET /api/milestones/<id>/image,
 * 1200 by 630, the same Satori renderer and fonts as the share image in
 * app/og. It says the name of the mark and one plain line, with the product
 * name. It never carries a workbook title, a shelf name, an author, a date
 * or any answer: the mark holds none of those, and the route reads nothing
 * else.
 *
 * Only the owner can fetch it. The mark is read through the reader's own
 * client, so row level security answers for anyone else with a plain 404.
 * The reader saves or shares the file themselves; there is no public page.
 * Never stored by a cache.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return notFound();
  const session = await getReaderSession();
  if (!session) return notFound();
  const supabase = await createUserClient();
  const { data } = await supabase.from("milestone_marks").select("kind").eq("id", id).eq("user_id", session.userId).maybeSingle();
  const kind = (data as { kind?: string } | null)?.kind;
  if (!isMilestoneKind(kind)) return notFound();

  const copy = MILESTONE_COPY[kind];
  const p = activeDirection.light;
  const serif = COVER_FONT_FAMILIES.serif;
  const sans = COVER_FONT_FAMILIES.sans;

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: p.canvas, color: p.ink, padding: "80px", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontFamily: sans, fontWeight: 600, fontSize: 30, color: p["ink-soft"] }}>{brand.name}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", width: 96, height: 8, borderRadius: 4, background: p["brand-text"] }} />
          <div style={{ display: "flex", fontFamily: serif, fontWeight: 700, fontSize: 104, lineHeight: 1.05 }}>{copy.name}</div>
          <div style={{ display: "flex", fontFamily: sans, fontWeight: 600, fontSize: 40, color: p["ink-soft"] }}>{copy.imageLine}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: coverFonts(activeDirection), headers: { "Cache-Control": NO_STORE } },
  );
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": NO_STORE } });
}
