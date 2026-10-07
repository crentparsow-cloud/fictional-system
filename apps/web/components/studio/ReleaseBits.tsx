import { releaseNotice } from "@/lib/author-release";

/** One line of feedback after a sign-off or price action. Fixed codes only, never free text. */
export function ReleaseNoticeLine({ code }: { code: string | string[] | undefined }) {
  const m = releaseNotice(code);
  if (!m) return null;
  return (
    <p className={`admin-notice admin-notice-${m.tone}`} role={m.tone === "error" ? "alert" : "status"}>
      {m.text}
    </p>
  );
}
