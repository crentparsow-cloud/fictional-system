import { describe, expect, it, vi } from "vitest";
import { chunkSentences } from "./sentences";
import { clampRate, matchVoice, platformOf, pollVoices, Speaker, utteranceSetup, type SynthLike, type UtteranceLike, type VoiceLike } from "./speech";

const v = (name: string, lang: string, extra: Partial<VoiceLike> = {}): VoiceLike => ({ name, lang, ...extra });

describe("matchVoice", () => {
  const voices = [v("Anna", "de-DE"), v("Sam", "en-US", { default: true }), v("Daniel", "en-GB", { localService: true }), v("Karen", "en-AU")];
  it("prefers the exact region", () => {
    expect(matchVoice(voices, "en-GB")?.name).toBe("Daniel");
    expect(matchVoice(voices, "en-AU")?.name).toBe("Karen");
  });
  it("settles for the same language by prefix", () => {
    expect(matchVoice(voices, "en-IE")?.name).toBe("Daniel");
    expect(matchVoice(voices, "en")?.name).toBe("Daniel");
  });
  it("never crosses into another language", () => {
    expect(matchVoice(voices, "fr-FR")).toBeNull();
    expect(matchVoice([], "en-GB")).toBeNull();
    expect(matchVoice(voices, "")).toBeNull();
  });
  it("prefers a voice on the device, then the default", () => {
    const list = [v("Net", "en-GB", { localService: false, default: true }), v("Local", "en-GB", { localService: true })];
    expect(matchVoice(list, "en-GB")?.name).toBe("Local");
    expect(matchVoice([v("A", "en-GB"), v("B", "en-GB", { default: true })], "en-GB")?.name).toBe("B");
  });
  it("reads underscores in language tags", () => {
    expect(matchVoice([v("Android", "en_GB")], "en-GB")?.name).toBe("Android");
  });
});

describe("platformOf and utteranceSetup", () => {
  const voice = v("Daniel", "en-GB");
  it("detects the platforms that need different handling", () => {
    expect(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
    expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("desktop");
    expect(platformOf("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
    expect(platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
  });
  it("sets the voice on iOS, the language alone on Android, both on desktop", () => {
    expect(utteranceSetup("ios", voice, "en-GB", 1)).toMatchObject({ voice, lang: "en-GB" });
    expect(utteranceSetup("android", voice, "en-GB", 1)).toMatchObject({ voice: null, lang: "en-GB" });
    expect(utteranceSetup("desktop", voice, "en-GB", 1)).toMatchObject({ voice, lang: "en-GB" });
  });
  it("falls back to the book's language when there is no voice", () => {
    expect(utteranceSetup("android", null, "en-GB", 1)).toEqual({ rate: 1, lang: "en-GB", voice: null });
  });
  it("keeps the rate at 2 or below", () => {
    expect(clampRate(5)).toBe(2);
    expect(clampRate(0.1)).toBe(0.5);
    expect(clampRate(Number.NaN)).toBe(1);
    expect(utteranceSetup("desktop", null, "en", 3).rate).toBe(2);
  });
});

describe("pollVoices", () => {
  function fakeTimers() {
    const queue: Array<() => void> = [];
    return { queue, setTimeout: (cb: () => void) => { queue.push(cb); return queue.length; }, clearTimeout: () => undefined };
  }
  it("resolves at once when the voices are already there", async () => {
    const synth = { getVoices: () => [v("A", "en")] };
    expect(await pollVoices(synth, fakeTimers())).toHaveLength(1);
  });
  it("polls every 250 ms and gives up after 2 seconds", async () => {
    const t = fakeTimers();
    const delays: number[] = [];
    const timers = { setTimeout: (cb: () => void, ms: number) => { delays.push(ms); return t.setTimeout(cb); }, clearTimeout: t.clearTimeout };
    const synth = { getVoices: vi.fn(() => [] as VoiceLike[]) };
    const done = pollVoices(synth, timers);
    while (t.queue.length) t.queue.shift()!();
    expect(await done).toEqual([]);
    expect(delays).toEqual(Array(8).fill(250));
  });
  it("resolves as soon as the list appears", async () => {
    const t = fakeTimers();
    let voices: VoiceLike[] = [];
    const synth = { getVoices: () => voices };
    const done = pollVoices(synth, t);
    t.queue.shift()!();
    voices = [v("Late", "en-GB")];
    t.queue.shift()!();
    expect(await done).toHaveLength(1);
  });
  it("also resolves on voiceschanged", async () => {
    const t = fakeTimers();
    let voices: VoiceLike[] = [];
    let handler: (() => void) | null = null;
    const synth = { getVoices: () => voices, addEventListener: (_: string, cb: () => void) => { handler = cb; }, removeEventListener: () => undefined };
    const done = pollVoices(synth, t);
    voices = [v("Event", "en")];
    handler!();
    expect(await done).toHaveLength(1);
  });
});

function fakeSynth() {
  const spoken: UtteranceLike[] = [];
  const synth: SynthLike & { spoken: UtteranceLike[]; cancels: number } = {
    speaking: false,
    spoken,
    cancels: 0,
    getVoices: () => [v("Daniel", "en-GB", { localService: true })],
    speak: (u) => void spoken.push(u),
    cancel() { this.cancels++; },
  };
  return synth;
}
const make = (text: string): UtteranceLike => ({ text, rate: 1, lang: "", voice: null, onend: null, onerror: null });

describe("Speaker", () => {
  const chunks = chunkSentences("One here. Two here. Three here.");
  async function setup() {
    const synth = fakeSynth();
    const log: string[] = [];
    const sp = new Speaker({ synth, makeUtterance: make, platform: "desktop", lang: "en-GB", onSentence: (i) => log.push(`s${i}`), onState: (s) => log.push(s), onEnd: () => log.push("end") });
    await sp.prepare({ setTimeout: () => 0, clearTimeout: () => undefined });
    sp.setChunks(chunks);
    return { synth, sp, log };
  }

  it("speaks one sentence at a time and moves on when each ends", async () => {
    const { synth, sp, log } = await setup();
    sp.play();
    expect(synth.spoken.map((u) => u.text)).toEqual(["One here."]);
    synth.spoken.at(-1)!.onend!();
    synth.spoken.at(-1)!.onend!();
    expect(synth.spoken.map((u) => u.text)).toEqual(["One here.", "Two here.", "Three here."]);
    synth.spoken.at(-1)!.onend!();
    expect(log.at(-1)).toBe("end");
    expect(sp.status).toBe("idle");
  });

  it("sets voice, lang and a capped rate on each utterance", async () => {
    const { synth, sp } = await setup();
    sp.setRate(9);
    sp.play();
    expect(synth.spoken[0]).toMatchObject({ rate: 2, lang: "en-GB" });
    expect(synth.spoken[0]!.voice?.name).toBe("Daniel");
  });

  it("pauses on the current sentence and resumes from the same one", async () => {
    const { synth, sp } = await setup();
    sp.play();
    synth.spoken.at(-1)!.onend!();
    expect(sp.position).toBe(1);
    sp.pause();
    expect(sp.status).toBe("paused");
    sp.resume();
    expect(synth.spoken.at(-1)!.text).toBe("Two here.");
  });

  it("ignores the end event of an utterance that was cancelled", async () => {
    const { synth, sp } = await setup();
    sp.play();
    const first = synth.spoken[0]!;
    sp.pause();
    first.onend!();
    expect(sp.position).toBe(0);
    expect(synth.spoken).toHaveLength(1);
  });

  it("starts from a stored position", async () => {
    const { synth, sp } = await setup();
    sp.setChunks(chunks, 2);
    sp.play();
    expect(synth.spoken[0]!.text).toBe("Three here.");
  });

  it("skips forward and back within the list", async () => {
    const { synth, sp } = await setup();
    sp.play();
    sp.skip(1);
    expect(synth.spoken.at(-1)!.text).toBe("Two here.");
    sp.skip(-1);
    sp.skip(-1);
    expect(synth.spoken.at(-1)!.text).toBe("One here.");
    expect(sp.position).toBe(0);
  });

  it("reports a real error but not its own cancel", async () => {
    const synth = fakeSynth();
    const errors: string[] = [];
    const sp = new Speaker({ synth, makeUtterance: make, platform: "ios", lang: "en-GB", onError: (r) => errors.push(r) });
    sp.setChunks(chunks);
    sp.play();
    synth.spoken[0]!.onerror!({ error: "interrupted" });
    expect(errors).toEqual([]);
    synth.spoken[0]!.onerror!({ error: "synthesis-failed" });
    expect(errors).toEqual(["synthesis-failed"]);
    expect(sp.status).toBe("paused");
  });

  it("does nothing with no sentences", async () => {
    const { synth, sp } = await setup();
    sp.setChunks([]);
    sp.play();
    expect(synth.spoken).toEqual([]);
  });
});
