import type { ReactNode } from "react";

/**
 * The band at the top of an information page (redesign group D). A calm wash
 * behind the heading, an optional eyebrow and lead, and room for actions.
 */
export function DHero({
  eyebrow,
  title,
  lead,
  children,
  align = "start",
  tone = "wash",
  titleId,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  align?: "start" | "center";
  tone?: "wash" | "plain";
  titleId?: string;
}) {
  return (
    <header className={`d-hero d-hero-${tone} d-hero-${align}`}>
      <div className="wrap d-hero-inner">
        {eyebrow ? <p className="d-eyebrow">{eyebrow}</p> : null}
        <h1 id={titleId}>{title}</h1>
        {lead ? <p className="d-lead">{lead}</p> : null}
        {children}
      </div>
    </header>
  );
}
