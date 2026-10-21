"use client";

import type { WorkbookV3 } from "@akana/schema";
import { Card, Eyebrow } from "./parts";

export type Letter = NonNullable<WorkbookV3["letters"]>[number];

/**
 * Fills {first_name} in a letter body. With no name known, the placeholder
 * and the punctuation that follows it are dropped and the next word is
 * capitalised, so "{first_name}, welcome." reads "Welcome." and never shows a
 * brace.
 */
export function fillLetter(body: string, firstName?: string): string {
  const name = firstName?.trim();
  if (name) return body.replaceAll("{first_name}", name);
  return body.replace(/\{first_name\}[,.:]?\s*(\p{L})?/gu, (_m, next: string | undefined) => (next ? next.toUpperCase() : ""));
}

/** One author letter (12.1). A letter from Akana about a public domain author is labelled as Akana's. */
export function LetterCard({ letter, firstName }: { letter: Letter; firstName?: string }) {
  const paragraphs = fillLetter(letter.body, firstName).split(/\n\n+/);
  return (
    <Card flat className="ak-letter">
      <Eyebrow>{letter.demo ? `${letter.title} (demo letter)` : letter.title}</Eyebrow>
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <p className="ak-muted ak-letter-signed">{letter.signed}</p>
    </Card>
  );
}

/** The letters that sit at one place: the welcome letter (unit undefined) or those before a unit. */
export function lettersAt(doc: Pick<WorkbookV3, "letters">, unit?: number): Letter[] {
  return (doc.letters ?? []).filter((l) => (unit === undefined ? l.kind === "welcome" : l.kind === "unit" && l.at_unit === unit));
}
