"use client";

import { useActionState } from "react";
import { ShareLink } from "@/components/share/ShareLink";
import { turnOffCertificateLink, turnOnCertificateLink, type ShareState } from "@/app/(reader)/you/certificates/[slug]/actions";

/** The public link: off by default. Turning it on shows the address once. */
export function CertificateShare({ slug, shared }: { slug: string; shared: boolean }) {
  const [on, onAction, onPending] = useActionState<ShareState, FormData>(turnOnCertificateLink, { error: null });
  const [off, offAction, offPending] = useActionState<ShareState, FormData>(turnOffCertificateLink, { error: null });
  const link = on.link ? new URL(on.link).pathname : null;
  const isShared = (shared || Boolean(link)) && !off.off;
  return (
    <div className="certificate-share">
      {link ? (
        <p>
          Your link is ready. Copy it now, because it cannot be shown again. <ShareLink path={link} label="Copy link" shareTitle="I finished a workbook" />
        </p>
      ) : null}
      {isShared ? (
        <form action={offAction}>
          <input type="hidden" name="slug" value={slug} />
          <p className="muted">Anyone with the link can see your name and the workbook title. Nothing else.</p>
          <button type="submit" className="btn secondary" disabled={offPending}>
            Turn the link off
          </button>
        </form>
      ) : (
        <form action={onAction}>
          <input type="hidden" name="slug" value={slug} />
          <p className="muted">Off. Only you can see this certificate. A link lets someone else see your name and the workbook title, and nothing else.</p>
          <button type="submit" className="btn secondary" disabled={onPending}>
            Make a link to share
          </button>
        </form>
      )}
      {on.error || off.error ? (
        <p className="form-error" role="alert">
          {on.error ?? off.error}
        </p>
      ) : null}
    </div>
  );
}
