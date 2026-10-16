/**
 * A real screenshot of the running app for the marketing pages (plan 1.8).
 * The files in public/screens are made by scripts/screens.mjs from the
 * app itself at phone and desktop width, under 150 KB each. The alt text says
 * what the screen shows, because the picture carries no words of its own.
 */
export const SHOTS = {
  "today-phone": { w: 780, h: 1500, kind: "phone" },
  "explore-phone": { w: 780, h: 1500, kind: "phone" },
  "workbook-phone": { w: 780, h: 1500, kind: "phone" },
  "unit-phone": { w: 780, h: 1500, kind: "phone" },
  "start-phone": { w: 780, h: 1500, kind: "phone" },
  "trust-desktop": { w: 1280, h: 800, kind: "desktop" },
  "explore-desktop": { w: 1280, h: 800, kind: "desktop" },
} as const;

export type ShotName = keyof typeof SHOTS;

export function MarketingShot({ name, alt, priority = false }: { name: ShotName; alt: string; priority?: boolean }) {
  const s = SHOTS[name];
  return (
    <figure className="mk-shot" data-kind={s.kind}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/screens/${name}.webp`} width={s.w} height={s.h} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" />
    </figure>
  );
}
