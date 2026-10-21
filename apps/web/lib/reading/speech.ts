import type { Chunk } from "./sentences";
import { readBoundary } from "./words";

/**
 * Read aloud with the browser's own voice (3.5). Nothing is sent anywhere:
 * the words are spoken on the device by the voices the device already has.
 *
 * The rules that make it behave across browsers, each one a known trap:
 *   - getVoices() is empty until the browser has loaded its list, so it is
 *     polled every 250 ms for at most 2 seconds, and also listened for.
 *   - Chrome on desktop cuts an utterance off at about 15 seconds, so the
 *     text is spoken one sentence at a time (see sentences.ts).
 *   - The rate stays at 2 or below. Some engines fail outright above that.
 *   - iOS needs utterance.voice set. Android needs utterance.lang set, and
 *     can go silent if it is given a voice object. Desktop is given both.
 *   - A voice is matched to the language of the book by prefix, so "en-GB"
 *     prefers a British voice and settles for any English one. It never
 *     falls back to a voice in another language.
 *
 * This file has no DOM in it. The browser objects arrive through the small
 * interfaces below, so the tests drive it with fakes.
 */

export const MAX_RATE = 2;
export const MIN_RATE = 0.5;
export const DEFAULT_RATE = 1;
export const VOICE_POLL_MS = 250;
export const VOICE_POLL_CAP_MS = 2000;

export interface VoiceLike {
  name: string;
  lang: string;
  default?: boolean;
  localService?: boolean;
  voiceURI?: string;
}

export interface UtteranceLike {
  text: string;
  rate: number;
  lang: string;
  voice: VoiceLike | null;
  onend: ((ev?: unknown) => void) | null;
  onerror: ((ev?: { error?: string }) => void) | null;
  onboundary?: ((ev?: unknown) => void) | null;
}

export interface SynthLike {
  speaking: boolean;
  getVoices(): VoiceLike[];
  speak(u: UtteranceLike): void;
  cancel(): void;
  addEventListener?(type: "voiceschanged", cb: () => void): void;
  removeEventListener?(type: "voiceschanged", cb: () => void): void;
}

export type Platform = "ios" | "android" | "desktop";

export function platformOf(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPad|iPhone|iPod/.test(userAgent)) return "ios";
  // iPadOS 13 and later report themselves as a Mac with a touch screen.
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_RATE;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(rate * 20) / 20));
}

const primary = (tag: string) => tag.toLowerCase().replace("_", "-").split("-")[0] ?? "";

/**
 * The best voice for a language tag, or null when the device has none in that
 * language. Exact tag first, then the same language with the same region
 * written differently, then any voice in the language. Within a tier, a voice
 * stored on the device beats a network voice, and the browser's default
 * beats the rest.
 */
export function matchVoice(voices: readonly VoiceLike[], lang: string): VoiceLike | null {
  const want = lang.toLowerCase().replace("_", "-");
  const base = primary(want);
  if (!base) return null;
  const inLanguage = voices.filter((v) => primary(v.lang) === base);
  if (!inLanguage.length) return null;
  const rank = (v: VoiceLike) => {
    const tag = v.lang.toLowerCase().replace("_", "-");
    const tier = tag === want ? 0 : want.includes("-") && tag.startsWith(`${base}-`) && tag.split("-")[1] === want.split("-")[1] ? 0 : tag === base ? 1 : 2;
    return tier * 4 + (v.localService ? 0 : 2) + (v.default ? 0 : 1);
  };
  return [...inLanguage].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/** Wait for the browser's voice list: poll every 250 ms, give up after 2 seconds. */
export function pollVoices(
  synth: Pick<SynthLike, "getVoices" | "addEventListener" | "removeEventListener">,
  timers: { setTimeout: (cb: () => void, ms: number) => unknown; clearTimeout: (id: unknown) => void } = {
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
  intervalMs = VOICE_POLL_MS,
  capMs = VOICE_POLL_CAP_MS,
): Promise<VoiceLike[]> {
  return new Promise((resolve) => {
    let waited = 0;
    let timer: unknown = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer !== null) timers.clearTimeout(timer);
      synth.removeEventListener?.("voiceschanged", check);
      resolve(synth.getVoices());
    };
    function check() {
      if (synth.getVoices().length > 0) finish();
    }
    synth.addEventListener?.("voiceschanged", check);
    const tick = () => {
      if (finished) return;
      if (synth.getVoices().length > 0 || waited >= capMs) return finish();
      waited += intervalMs;
      timer = timers.setTimeout(tick, intervalMs);
    };
    tick();
  });
}

/** How one utterance is set up for a platform. Pure, so it can be tested. */
export function utteranceSetup(platform: Platform, voice: VoiceLike | null, lang: string, rate: number): { rate: number; lang: string; voice: VoiceLike | null } {
  const r = clampRate(rate);
  if (platform === "ios") return { rate: r, lang: voice?.lang ?? lang, voice };
  if (platform === "android") return { rate: r, lang: voice?.lang ?? lang, voice: null };
  return { rate: r, lang: voice?.lang ?? lang, voice };
}

export type SpeakerState = "idle" | "playing" | "paused";

export interface SpeakerEvents {
  /** The sentence about to be spoken, by index in the list. */
  onSentence?: (index: number) => void;
  onState?: (state: SpeakerState) => void;
  /**
   * The voice reached a word: the sentence index and the character position
   * in the spoken text. Only sent by voices that report boundaries; others
   * simply never call it, and the sentence highlight stands alone.
   */
  onWord?: (index: number, charIndex: number) => void;
  /** The last sentence has been spoken. */
  onEnd?: () => void;
  /** The browser refused or failed. Not a normal stop. */
  onError?: (reason: string) => void;
}

export interface SpeakerOptions extends SpeakerEvents {
  synth: SynthLike;
  makeUtterance: (text: string) => UtteranceLike;
  platform: Platform;
  lang: string;
}

/**
 * Speaks a list of sentences one after another. Pause is "stop here, and
 * start again from this sentence", because pause and resume on a speech
 * engine is unreliable across browsers. That also gives the exact-passage
 * resume: the position is always a sentence index.
 */
export class Speaker {
  private chunks: readonly Chunk[] = [];
  private index = 0;
  private state: SpeakerState = "idle";
  private voice: VoiceLike | null = null;
  private rate = DEFAULT_RATE;
  /** Bumped on every cancel, so a late "end" from a cancelled utterance is ignored. */
  private run = 0;

  constructor(private readonly o: SpeakerOptions) {}

  get position(): number {
    return this.index;
  }
  get status(): SpeakerState {
    return this.state;
  }
  get currentRate(): number {
    return this.rate;
  }

  /** Load the device's voices (waits up to 2 seconds) and choose one for the language. */
  async prepare(timers?: Parameters<typeof pollVoices>[1]): Promise<VoiceLike | null> {
    const voices = await pollVoices(this.o.synth, timers);
    this.voice = matchVoice(voices, this.o.lang);
    return this.voice;
  }

  get hasVoice(): boolean {
    return this.voice !== null;
  }

  setChunks(chunks: readonly Chunk[], startAt = 0): void {
    this.stop();
    this.chunks = chunks;
    this.index = Math.min(Math.max(0, startAt), Math.max(0, chunks.length - 1));
  }

  setRate(rate: number): void {
    this.rate = clampRate(rate);
    // The sentence in progress keeps its old rate; the change starts at the next one, or now if playing.
    if (this.state === "playing") this.speakFrom(this.index);
  }

  play(from?: number): void {
    if (!this.chunks.length) return;
    if (from !== undefined) this.index = Math.min(Math.max(0, from), this.chunks.length - 1);
    // A finished list starts again from the top.
    this.speakFrom(this.index);
  }

  pause(): void {
    if (this.state !== "playing") return;
    this.run++;
    this.o.synth.cancel();
    this.set("paused");
  }

  resume(): void {
    if (this.state === "paused") this.speakFrom(this.index);
  }

  stop(): void {
    this.run++;
    if (this.state !== "idle") this.o.synth.cancel();
    this.set("idle");
  }

  skip(by: 1 | -1): void {
    if (!this.chunks.length) return;
    const next = Math.min(this.chunks.length - 1, Math.max(0, this.index + by));
    this.index = next;
    if (this.state === "playing") this.speakFrom(next);
    else this.o.onSentence?.(next);
  }

  private speakFrom(i: number): void {
    const chunk = this.chunks[i];
    if (!chunk) return;
    const { synth } = this.o;
    const mine = ++this.run;
    synth.cancel();
    this.index = i;
    const u = this.o.makeUtterance(chunk.text);
    const setup = utteranceSetup(this.o.platform, this.voice, this.o.lang, this.rate);
    u.rate = setup.rate;
    u.lang = setup.lang;
    u.voice = setup.voice;
    u.onend = () => {
      if (mine !== this.run) return;
      if (i + 1 < this.chunks.length) this.speakFrom(i + 1);
      else {
        this.set("idle");
        this.index = 0;
        this.o.onEnd?.();
      }
    };
    u.onboundary = (ev) => {
      if (mine !== this.run) return;
      const b = readBoundary(ev);
      if (b) this.o.onWord?.(i, b.charIndex);
    };
    u.onerror = (ev) => {
      if (mine !== this.run) return;
      // "interrupted" and "canceled" are what our own cancel() produces.
      const reason = ev?.error ?? "error";
      if (reason === "interrupted" || reason === "canceled") return;
      this.set("paused");
      this.o.onError?.(reason);
    };
    this.set("playing");
    this.o.onSentence?.(i);
    synth.speak(u);
  }

  private set(next: SpeakerState): void {
    if (this.state === next) return;
    this.state = next;
    this.o.onState?.(next);
  }
}
