"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { sendNudge } from "@/app/(reader)/you/friends/actions";
import { NUDGE_BUTTONS, TALK_IT_OVER_NOTE, nudgeChoices, nudgeText, pollDelayMs, statusLine, talkItOver, type PairView } from "@/lib/friends/pair";

/**
 * The friend strip in the reader (6.2): one quiet line about the other
 * person, one pre-written nudge a day, and a "Talk it over" prompt after a
 * step. It learns that the friend finished a step over Supabase Realtime
 * Broadcast (a public channel named by a private key, no payload) and falls
 * back to checking every 45 seconds, or every five minutes while Realtime is
 * connected, only while the page is visible. Answers never reach this
 * component: it holds flags and a nudge code.
 */
interface Flags {
  friendFinishedToday: boolean;
  friendFinishedThisWeek: boolean;
  iFinishedToday: boolean;
  nudgeSentToday: boolean;
  nudgeCode: PairView["nudgeCode"];
}

export function FriendStrip({ pair, justFinished, stepNumber }: { pair: PairView; justFinished: boolean; stepNumber: number }) {
  const [flags, setFlags] = useState<Flags>({
    friendFinishedToday: pair.friendFinishedToday,
    friendFinishedThisWeek: pair.friendFinishedThisWeek ?? false,
    iFinishedToday: pair.iFinishedToday,
    nudgeSentToday: pair.nudgeSentToday,
    nudgeCode: pair.nudgeCode,
  });
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const connected = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/friends/status", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) return;
      const body = (await res.json()) as { pairs?: (Flags & { pairId: string })[] };
      const mine = body.pairs?.find((p) => p.pairId === pair.pairId);
      if (mine) setFlags({ friendFinishedToday: mine.friendFinishedToday, friendFinishedThisWeek: mine.friendFinishedThisWeek === true, iFinishedToday: mine.iFinishedToday, nudgeSentToday: mine.nudgeSentToday, nudgeCode: mine.nudgeCode });
    } catch {
      // offline: the next check tries again
    }
  }, [pair.pairId]);

  // Realtime Broadcast: a message with no payload says "look again".
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !anon) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    import("@supabase/supabase-js")
      .then(({ createClient }) => {
        if (cancelled) return;
        const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
        const channel = client
          .channel(`pair-${pair.channelKey}`)
          .on("broadcast", { event: "finished" }, () => void refresh())
          .subscribe((status) => {
            connected.current = status === "SUBSCRIBED";
          });
        cleanup = () => {
          connected.current = false;
          void client.removeChannel(channel);
        };
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [pair.channelKey, refresh]);

  // Polling fallback, only while the page is visible.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const delay = pollDelayMs({ realtimeConnected: connected.current, hidden: document.hidden });
      if (delay > 0) {
        timer = setTimeout(async () => {
          await refresh();
          schedule();
        }, delay);
      }
    };
    const onVisible = () => {
      if (timer) clearTimeout(timer);
      if (!document.hidden) void refresh();
      schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // My own finish changes what I may send, so look again after a step.
  useEffect(() => {
    if (!justFinished) return;
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [justFinished, refresh]);

  function nudge(code: Parameters<typeof sendNudge>[1]) {
    setNote(null);
    startTransition(async () => {
      const result = await sendNudge(pair.pairId, code);
      setNote(result.message);
      if (result.ok) setFlags((f) => ({ ...f, nudgeSentToday: true }));
    });
  }

  const choices = nudgeChoices(flags.friendFinishedToday);
  return (
    <aside className="card friend-strip" aria-label={`Doing this with ${pair.label}`}>
      <p>
        <strong>With {pair.label}.</strong> <span role="status">{statusLine({ label: pair.label, friendFinishedToday: flags.friendFinishedToday, friendPace: pair.friendPace, friendFinishedThisWeek: flags.friendFinishedThisWeek })}</span>
      </p>
      {flags.nudgeCode ? <p className="friend-nudge">{nudgeText(flags.nudgeCode, pair.label)}</p> : null}
      {flags.nudgeSentToday ? (
        <p className="muted small">You sent one today.</p>
      ) : (
        <div className="friend-nudges">
          {choices.map((code) => (
            <button key={code} type="button" className="btn secondary" disabled={pending} onClick={() => nudge(code)}>
              {NUDGE_BUTTONS[code]}
            </button>
          ))}
        </div>
      )}
      {note ? (
        <p className="muted small" role="status">
          {note}
        </p>
      ) : null}
      {justFinished ? (
        <div className="friend-talk">
          <h3>Talk it over</h3>
          <p>{talkItOver(stepNumber)}</p>
          <p className="muted small">{TALK_IT_OVER_NOTE}</p>
        </div>
      ) : null}
      <p className="muted small">
        <Link href="/you/friends">Manage this pairing</Link>
      </p>
    </aside>
  );
}
