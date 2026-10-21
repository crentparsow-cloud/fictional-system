"use client";

import { useActionState } from "react";
import { createInvite, type InviteState } from "@/app/(reader)/you/friends/actions";
import { ShareLink } from "@/components/share/ShareLink";
import { LABEL_MAX } from "@/lib/friends/pair";

/** Make an invitation link for one programme. The link is shown once and shared by the reader, not by Akana. */
export function InviteForm({ programmes }: { programmes: { enrolmentId: string; title: string }[] }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInvite, { error: null });
  const link = state.link ? new URL(state.link).pathname : null;
  return (
    <form action={action} className="card friends-invite">
      <label htmlFor="friend-wb">Workbook</label>
      <select id="friend-wb" name="enrolment" required defaultValue="">
        <option value="" disabled>
          Choose one
        </option>
        {programmes.map((p) => (
          <option key={p.enrolmentId} value={p.enrolmentId}>
            {p.title}
          </option>
        ))}
      </select>
      <label htmlFor="friend-label">How you appear to them</label>
      <input id="friend-label" name="label" type="text" maxLength={LABEL_MAX} placeholder="Your first name, or what they call you" autoComplete="off" />
      <p>
        <button type="submit" className="btn" disabled={pending}>
          Make an invitation link
        </button>
      </p>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {link ? (
        <p role="status">
          Your link is ready. Copy it now and send it to them yourself, because it cannot be shown again. It works for 14 days. <ShareLink path={link} label="Copy link" shareTitle="Do a workbook with me" />
        </p>
      ) : null}
    </form>
  );
}
