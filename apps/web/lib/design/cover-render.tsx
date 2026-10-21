/**
 * The cover renderer (plan 1.2, 1.9), one set of elements for Satori
 * (next/og): the portrait cover on /covers/<code>.png and the share image on
 * /og/<slug>. Flexbox and inline styles only, as Satori needs. Colours are
 * resolved from the direction's data, because an image cannot read CSS
 * variables. Fonts are the subset faces in lib/design/og-fonts.
 *
 * Format code, from the mock-ups: one, two or three bars for 4, 8 and 12 week
 * programmes, four small squares for a collection, a round play mark for
 * Start here. The label sits beside the mark. The shelf colour fills the
 * cover. The preview line is the last line.
 */
import type { CSSProperties, ReactElement } from "react";
import type { Direction, Palette } from "./directions";
import { BAR_COUNT, previewLine, titleLines, type CoverSpec } from "./cover-spec";

export type CoverScheme = "light" | "dark";

/** What fits on one line of the portrait cover at its type size. The share image has room for more. */
export const COVER_PREVIEW_CHARS = 26;

const FONT_SERIF = "AkanaCoverSerif";
const FONT_SANS = "AkanaCoverSans";
export const COVER_FONT_FAMILIES = { serif: FONT_SERIF, sans: FONT_SANS } as const;

const flex = (extra: CSSProperties = {}): CSSProperties => ({ display: "flex", ...extra });

function Mark({ spec, u, color, ground }: { spec: CoverSpec; u: number; color: string; ground: string }): ReactElement {
  if (spec.format === "collection") {
    const sq = (k: number) => <div key={k} style={{ width: 6 * u, height: 6 * u, borderRadius: 1.2 * u, background: color }} />;
    return (
      <div style={flex({ flexWrap: "wrap", width: 14 * u, height: 14 * u, gap: 2 * u })}>{[0, 1, 2, 3].map(sq)}</div>
    );
  }
  if (spec.format === "start") {
    return (
      <div style={flex({ width: 14 * u, height: 14 * u, borderRadius: 7 * u, background: color, alignItems: "center", justifyContent: "center" })}>
        <div style={{ width: 0, height: 0, marginLeft: 1.5 * u, borderTop: `${3 * u}px solid transparent`, borderBottom: `${3 * u}px solid transparent`, borderLeft: `${5 * u}px solid ${ground}` }} />
      </div>
    );
  }
  return (
    <div style={flex({ gap: 3 * u })}>
      {Array.from({ length: BAR_COUNT[spec.format] }, (_, i) => (
        <div key={i} style={{ width: 6 * u, height: 14 * u, borderRadius: 1.5 * u, background: color }} />
      ))}
    </div>
  );
}

function Motif({ d, u, accent }: { d: Direction; u: number; accent: string }): ReactElement | null {
  if (d.cover.motif === "circle") {
    return <div style={{ position: "absolute", left: 84 * u, top: 94 * u, width: 44 * u, height: 44 * u, borderRadius: 22 * u, background: accent, opacity: 0.12 }} />;
  }
  if (d.cover.motif === "wave") {
    return (
      <svg width={120 * u} height={40 * u} viewBox="0 0 120 40" style={{ position: "absolute", left: 0, top: 120 * u }}>
        <path d="M0 0 Q 60 -20 120 4 V 40 H 0 Z" fill={accent} opacity="0.08" />
      </svg>
    );
  }
  return null;
}

/**
 * The portrait cover, 3:4 at `width` pixels wide. `onDark` swaps to the dark
 * tones of the shelf; the share image and the stored covers use light.
 */
export function CoverArt({ spec, direction, width, scheme = "light" }: { spec: CoverSpec; direction: Direction; width: number; scheme?: CoverScheme }): ReactElement {
  const u = width / 120;
  const { tint, accent } = direction.shelves[spec.shelfId][scheme];
  const t = titleLines(spec.title);
  const frame = direction.cover.frame === "hairline";
  return (
    <div style={flex({ position: "relative", width, height: 160 * u, background: tint, borderRadius: direction.cover.radius * u, overflow: "hidden", border: frame ? `${Math.max(1, u * 0.6)}px solid ${accent}40` : "0 solid transparent", flexDirection: "column", padding: `${10 * u}px` })}>
      <Motif d={direction} u={u} accent={accent} />
      <div style={flex({ alignItems: "center", gap: 6 * u, height: 14 * u })}>
        <Mark spec={spec} u={u} color={accent} ground={tint} />
        <div style={flex({ fontFamily: FONT_SANS, fontWeight: 600, fontSize: 9 * u, color: accent })}>{spec.label}</div>
      </div>
      <div style={flex({ flexDirection: "column", marginTop: 17 * u })}>
        {t.lines.map((line, i) => (
          <div key={i} style={flex({ fontFamily: FONT_SERIF, fontWeight: 700, fontSize: 15 * u, lineHeight: 1.2, color: accent })}>
            {line}
          </div>
        ))}
        {spec.author ? <div style={flex({ marginTop: 6 * u, fontFamily: FONT_SANS, fontWeight: 600, fontSize: 8.5 * u, color: accent, opacity: 0.9 })}>{spec.author}</div> : null}
      </div>
      {spec.preview ? (
        <div style={flex({ position: "absolute", left: 10 * u, right: 10 * u, bottom: 10 * u, fontFamily: FONT_SANS, fontWeight: 600, fontSize: 7 * u, color: accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })}>{previewLine(spec.preview, COVER_PREVIEW_CHARS)}</div>
      ) : null}
    </div>
  );
}

/** The 1200 by 630 share image: the cover on the left, the words on the right. */
export function ShareImage({ spec, direction, brandName }: { spec: CoverSpec; direction: Direction; brandName: string }): ReactElement {
  const p: Palette = direction.light;
  const { accent } = direction.shelves[spec.shelfId].light;
  const t = spec.title.length > 70 ? `${spec.title.slice(0, 67)}...` : spec.title;
  const size = t.length > 50 ? 48 : t.length > 28 ? 60 : 72;
  return (
    <div style={flex({ width: "100%", height: "100%", background: p.canvas, color: p.ink, padding: "72px", alignItems: "center", gap: 64 })}>
      <CoverArt spec={spec} direction={direction} width={366} />
      <div style={flex({ flex: 1, flexDirection: "column", justifyContent: "center", gap: 24 })}>
        <div style={flex({ fontFamily: FONT_SANS, fontWeight: 600, fontSize: 28, color: p["ink-soft"] })}>{brandName}</div>
        <div style={flex({ fontFamily: FONT_SERIF, fontWeight: 700, fontSize: size, lineHeight: 1.12, color: p.ink })}>{t}</div>
        {spec.author ? <div style={flex({ fontFamily: FONT_SANS, fontWeight: 600, fontSize: 32, color: accent })}>{spec.author}</div> : null}
        {spec.preview ? <div style={flex({ fontFamily: FONT_SANS, fontWeight: 600, fontSize: 28, color: p["ink-soft"] })}>{spec.preview}</div> : null}
        <div style={flex({ fontFamily: FONT_SANS, fontWeight: 600, fontSize: 24, color: accent })}>{spec.label}</div>
      </div>
    </div>
  );
}
