"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LISTEN_MODE_KEY, LISTEN_RATE_KEY, listenPositionKey, makePosition, nextRate, parsePosition, resumeIndex, screenKey, type ListenMode } from "@/lib/reading/listen";
import { chunkSentences, type Chunk } from "@/lib/reading/sentences";
import { sourceWordRange } from "@/lib/reading/words";
import { DEFAULT_RATE, Speaker, clampRate, platformOf, type SpeakerState, type SynthLike, type UtteranceLike } from "@/lib/reading/speech";

/** One sentence on the page, with the element it came from. */
interface Line extends Chunk {
  el: HTMLElement;
}

const store = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // the choice simply is not remembered
    }
  },
};

/** The writing on the open screen: only elements the workbook marked data-ra, never a field or an answer. */
function collect(root: HTMLElement): { lines: Line[]; screen: string } {
  const lines: Line[] = [];
  root.querySelectorAll<HTMLElement>("[data-ra]").forEach((el) => {
    if (el.getClientRects().length === 0) return;
    const text = el.textContent ?? "";
    for (const c of chunkSentences(text)) lines.push({ ...c, el });
  });
  const s = root.querySelector<HTMLElement>(".ak-screen");
  const screen = screenKey({
    screen: s?.classList[1] ?? null,
    unit: s?.dataset.unit ?? null,
    exercise: s?.dataset.exercise ?? null,
    page: s?.dataset.page ?? null,
  });
  return { lines, screen };
}

/** A range over characters start..end of an element's text, for the CSS highlight. */
function rangeFor(el: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let seen = 0;
  let began = false;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.textContent?.length ?? 0;
    if (!began && start < seen + len) {
      range.setStart(n, start - seen);
      began = true;
    }
    if (began && end <= seen + len) {
      range.setEnd(n, end - seen);
      return range;
    }
    seen += len;
  }
  return began ? range : null;
}

type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };
const registry = (): HighlightRegistry | null => (typeof CSS !== "undefined" && "highlights" in CSS ? ((CSS as unknown as { highlights: HighlightRegistry }).highlights) : null);

function clearMarks(): void {
  registry()?.delete("ak-reading");
  registry()?.delete("ak-word");
  document.querySelectorAll(".ra-now").forEach((e) => e.classList.remove("ra-now"));
}

/**
 * Read aloud (3.5). Two modes with a switch, Read and Listen. In Listen the
 * reader has Play, and while it speaks a bar stays above the tab bar with
 * Back, Pause, Next, speed and Read. The sentence being spoken is
 * highlighted, and the place is kept on this device so Play carries on from
 * the same sentence. Only text the workbook marked as reading is spoken: a
 * reader's answers are never in it.
 */
export function ReadAloud({ enrolmentId, lang }: { enrolmentId: string; lang: string }) {
  const supported = useSyncExternalStore(
    () => () => undefined,
    () => "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined",
    () => false,
  );
  // Only rendered after the workbook has loaded in the browser, so reading the device here cannot mismatch the server.
  const [mode, setMode] = useState<ListenMode>(() => (store.get(LISTEN_MODE_KEY) === "listen" ? "listen" : "read"));
  const [state, setState] = useState<SpeakerState>("idle");
  const [rate, setRate] = useState(() => {
    const r = Number(store.get(LISTEN_RATE_KEY));
    return r > 0 ? clampRate(r) : DEFAULT_RATE;
  });
  const [now, setNow] = useState("");
  const [voice, setVoice] = useState<"unknown" | "ok" | "none">("unknown");
  const [problem, setProblem] = useState<string | null>(null);
  const speaker = useRef<Speaker | null>(null);
  const lines = useRef<Line[]>([]);
  const screen = useRef("");
  const rootRef = useRef<HTMLElement | null>(null);

  const refresh = useCallback(() => {
    const root = rootRef.current ?? document.querySelector<HTMLElement>(".ak-player-body");
    rootRef.current = root;
    if (!root) return;
    const next = collect(root);
    const changed = next.screen !== screen.current;
    lines.current = next.lines;
    screen.current = next.screen;
    if (changed && speaker.current && speaker.current.status !== "idle") {
      speaker.current.stop();
      clearMarks();
      setNow("");
    }
  }, []);

  // Keep the list of sentences current as the reader moves between screens.
  useEffect(() => {
    if (!supported) return;
    refresh();
    const root = document.querySelector<HTMLElement>(".ak-player-body");
    if (!root) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const watch = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 200);
    });
    watch.observe(root, { childList: true, subtree: true });
    return () => {
      watch.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [supported, refresh]);

  const mark = useCallback(
    (i: number) => {
      const line = lines.current[i];
      if (!line) return;
      clearMarks();
      line.el.classList.add("ra-now");
      const reg = registry();
      const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
      const range = reg && H ? rangeFor(line.el, line.start, line.end) : null;
      if (reg && H && range) reg.set("ak-reading", new H(range));
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
      line.el.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
      setNow(line.text);
      store.set(listenPositionKey(enrolmentId), JSON.stringify(makePosition(screen.current, i, line.text)));
    },
    [enrolmentId],
  );

  // Word by word (extends the sentence highlight). Voices that report word
  // boundaries drive it; a voice that sends none leaves the sentence
  // highlight on its own, which is the fallback and needs no code.
  const markWord = useCallback((index: number, charIndex: number) => {
    const line = lines.current[index];
    const reg = registry();
    const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    if (!line || !reg || !H) return;
    const w = sourceWordRange(line.el.textContent ?? "", line.start, line.text, charIndex);
    const range = w ? rangeFor(line.el, w.start, w.end) : null;
    if (range) reg.set("ak-word", new H(range));
    else reg.delete("ak-word");
  }, []);

  const ensure = useCallback(async (): Promise<Speaker | null> => {
    if (speaker.current) return speaker.current;
    const synth = window.speechSynthesis as unknown as SynthLike;
    const s = new Speaker({
      synth,
      makeUtterance: (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
      platform: platformOf(navigator.userAgent, navigator.maxTouchPoints),
      lang,
      onSentence: mark,
      onWord: markWord,
      onState: (st) => {
        setState(st);
        if (st === "idle") {
          clearMarks();
        }
      },
      onEnd: () => setNow(""),
      onError: () => setProblem("The voice stopped. Press Play to try again."),
    });
    const v = await s.prepare();
    setVoice(v ? "ok" : "none");
    speaker.current = s;
    return s;
  }, [lang, mark, markWord]);

  useEffect(() => {
    return () => {
      speaker.current?.stop();
      clearMarks();
    };
  }, []);

  const choose = (m: ListenMode) => {
    setMode(m);
    store.set(LISTEN_MODE_KEY, m);
    setProblem(null);
    if (m === "read") {
      speaker.current?.stop();
      setNow("");
    } else {
      void ensure();
    }
  };

  const play = async () => {
    setProblem(null);
    refresh();
    const s = await ensure();
    if (!s || !s.hasVoice) return;
    if (s.status === "paused") {
      s.resume();
      return;
    }
    if (!lines.current.length) {
      setProblem("There is nothing to read on this screen.");
      return;
    }
    const at = resumeIndex(
      parsePosition(store.get(listenPositionKey(enrolmentId))),
      screen.current,
      lines.current.map((l) => l.text),
    );
    s.setChunks(lines.current, at);
    s.play(at);
  };

  const pause = () => speaker.current?.pause();
  const faster = () => {
    const r = nextRate(rate);
    setRate(r);
    store.set(LISTEN_RATE_KEY, String(r));
    speaker.current?.setRate(r);
  };
  useEffect(() => {
    speaker.current?.setRate(rate);
  }, [rate]);

  if (!supported) return null;
  const active = state !== "idle";

  return (
    <>
      <div className="ra-switch" role="group" aria-label="How to read this screen">
        <button type="button" className="ra-opt" aria-pressed={mode === "read"} onClick={() => choose("read")}>
          Read
        </button>
        <button type="button" className="ra-opt" aria-pressed={mode === "listen"} onClick={() => choose("listen")}>
          Listen
        </button>
        {mode === "listen" && !active ? (
          <button type="button" className="ra-play" onClick={() => void play()} disabled={voice === "none"}>
            Play
          </button>
        ) : null}
        <Link className="ra-help small" href="/help/read-aloud">
          What the voice cannot do
        </Link>
      </div>
      {mode === "listen" && voice === "none" ? (
        <p className="small muted" role="status">
          This device has no voice for this workbook&apos;s language, so nothing can be read aloud here.
        </p>
      ) : null}
      {problem ? (
        <p className="small muted" role="status">
          {problem}
        </p>
      ) : null}
      {mode === "listen" && active ? (
        <div className="ra-bar" role="region" aria-label="Read aloud">
          <p className="ra-line" aria-live="off">
            {now || "Ready"}
          </p>
          <div className="ra-controls">
            <button type="button" className="ra-btn" onClick={() => speaker.current?.skip(-1)} aria-label="Previous sentence">
              Back
            </button>
            {state === "playing" ? (
              <button type="button" className="ra-btn ra-main" onClick={pause}>
                Pause
              </button>
            ) : (
              <button type="button" className="ra-btn ra-main" onClick={() => void play()}>
                Play
              </button>
            )}
            <button type="button" className="ra-btn" onClick={() => speaker.current?.skip(1)} aria-label="Next sentence">
              Next
            </button>
            <button type="button" className="ra-btn" onClick={faster} aria-label={`Speed ${rate} times. Press to change.`}>
              {rate}x
            </button>
            <button type="button" className="ra-btn" onClick={() => choose("read")}>
              Read
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
