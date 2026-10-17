/** WCAG 2.x contrast ratio between two #rrggbb colours. Used by the design tests and the kit. */
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = (i: number) => channel(parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * n(1) + 0.7152 * n(3) + 0.0722 * n(5);
}

export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
