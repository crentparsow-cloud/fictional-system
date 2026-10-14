import Link from "next/link";
import { LEAVE_LINE } from "@/lib/reading/resume";

/**
 * "Continue" to the exact field (3.7). On the reader's workbook page it also
 * carries the one line that says it is safe to leave. Home shows the button
 * without repeating that line.
 */
export function ResumeCard({ href, where, withLine = false }: { href: string; where: string; withLine?: boolean }) {
  return (
    <div className="resume-card card card-flat">
      <div>
        <p className="resume-where">{where}</p>
        {withLine ? <p className="small muted">{LEAVE_LINE}</p> : null}
      </div>
      <Link className="btn" href={href}>
        Continue
      </Link>
    </div>
  );
}
