/**
 * The passkey prompt after first sign-in (13.3), the pure rule. It shows on
 * Today only when passkeys are open to this reader (the reader_passkeys
 * cohort flag and the mfa_passkey switch), the reader has no second factor
 * of any kind yet, and they have not dismissed it. Dismissing is kept on the
 * account (public.reader_prompts, migration 0064), so it does not come back
 * on another device. Whether the browser can do passkeys is checked on the
 * device, by the component.
 */
export interface PasskeyPromptInput {
  readerFlag: boolean;
  passkeysOpen: boolean;
  verifiedFactors: number;
  dismissed: boolean;
}

export function passkeyPromptDue(i: PasskeyPromptInput): boolean {
  return i.readerFlag && i.passkeysOpen && i.verifiedFactors === 0 && !i.dismissed;
}

export const PASSKEY_PROMPT_COPY = {
  title: "Add a passkey",
  body: "A passkey is an extra check after your sign-in link, using your fingerprint, face or screen lock. It takes a few seconds. You can remove it at any time.",
  add: "Add a passkey",
  later: "Not now",
} as const;
