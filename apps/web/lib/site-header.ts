/** What the public header offers, for a signed-out or a signed-in reader. */
export type HeaderAction = { href: string; label: string; kind: "link" | "button" };

export const SIGNED_OUT_ACTIONS: readonly HeaderAction[] = [
  { href: "/sign-in", label: "Sign in", kind: "link" },
  { href: "/library", label: "Try week 1 free", kind: "button" },
];

export const SIGNED_IN_ACTIONS: readonly HeaderAction[] = [
  { href: "/you", label: "You", kind: "link" },
  { href: "/today", label: "Today", kind: "button" },
];

export function headerActions(signedIn: boolean): readonly HeaderAction[] {
  return signedIn ? SIGNED_IN_ACTIONS : SIGNED_OUT_ACTIONS;
}

/** Reads the /api/session body. Anything unexpected counts as signed out. */
export function parseSessionBody(body: unknown): boolean {
  return typeof body === "object" && body !== null && (body as { signedIn?: unknown }).signedIn === true;
}
