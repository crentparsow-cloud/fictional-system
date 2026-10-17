import { CSSProperties } from "react";

const POSITIONS = [8, 22, 36, 50, 64, 78, 92, 15, 29, 43, 57, 71, 85, 5];
const EXTRA = [11, 25, 39, 53, 67, 81, 95, 18, 32, 46, 60, 74, 88, 2];

/**
 * One burst of confetti. Colours are the direction's (--confetti-1 to 4),
 * timing is in app/motion.css, and the CSS hides it for reduced motion. The
 * caller decides whether to mount it at all (never on a wellbeing title).
 * "programme" is the larger piece used by the programme-end reveal.
 */
export function Confetti({ size = "unit", className }: { size?: "unit" | "programme"; className?: string }) {
  const positions = size === "programme" ? [...POSITIONS, ...EXTRA] : POSITIONS;
  return (
    <span className={className ? `confetti ${className}` : "confetti"} data-size={size} aria-hidden="true">
      {positions.map((x, i) => (
        <i key={i} style={{ insetInlineStart: `${x}%`, animationDelay: `${(i % 5) * 60}ms`, background: `var(--confetti-${(i % 4) + 1})` } as CSSProperties} />
      ))}
    </span>
  );
}
