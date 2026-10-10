import enGB from "@/messages/en-GB.json";
import enUS from "@/messages/en-US.json";

/**
 * Interface strings (F-139), the part with no Next.js dependency so it can be
 * unit tested. lib/i18n.ts adds the request-bound helpers.
 *
 * Two message sets today, en-GB and en-US, both flat files keyed by
 * "area.name". No translations at launch and no dependency.
 */

export type Locale = "en-GB" | "en-US";
export type MessageKey = keyof typeof enGB;
export type Messages = Record<MessageKey, string>;

// The en-US file must carry every key the en-GB file has. This line fails
// typecheck if one goes missing.
const MESSAGES: Record<Locale, Messages> = { "en-GB": enGB, "en-US": enUS satisfies Messages };

export const DEFAULT_LOCALE: Locale = "en-GB";

/**
 * en-US when the header's best English tag is en-US, otherwise en-GB.
 * Non-English tags are skipped: a French reader gets the UK set.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const tags = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((t) => t.tag && t.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  const english = tags.find((t) => t.tag === "en" || t.tag.startsWith("en-"));
  if (!english) return DEFAULT_LOCALE;
  return english.tag === "en-us" ? "en-US" : "en-GB";
}

/** Whether the interface strings carry this key. For keys built from data, such as a shelf id. */
export function hasMessage(key: string): key is MessageKey {
  return Object.hasOwn(enGB, key);
}

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Builds a t() for a locale. Placeholders are written {name}. */
export function translator(locale: Locale): Translate {
  const messages = MESSAGES[locale];
  return (key, vars) => {
    const raw = messages[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
  };
}
