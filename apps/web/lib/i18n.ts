import "server-only";
import { headers } from "next/headers";
import { type Locale, type Translate, localeFromAcceptLanguage, translator } from "@/lib/locale";

export type { Locale, MessageKey, Translate } from "@/lib/locale";
export { DEFAULT_LOCALE, localeFromAcceptLanguage, translator } from "@/lib/locale";

/**
 * Interface strings (F-139) for the current request. The locale comes from
 * the Accept-Language header on the server: en-US when the header prefers
 * en-US, otherwise en-GB. A reader's saved locale on their profile takes over
 * once it is wired through.
 */
export async function getLocale(): Promise<Locale> {
  const h = await headers();
  return localeFromAcceptLanguage(h.get("accept-language"));
}

/** The t() for the current request. */
export async function getT(): Promise<{ t: Translate; locale: Locale }> {
  const locale = await getLocale();
  return { t: translator(locale), locale };
}
