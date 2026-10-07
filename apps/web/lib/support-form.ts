/**
 * Contact form state shared by the client form and the server action
 * (F-090). No server imports, so the client bundle stays small and clean.
 */
export type SupportField = "topic" | "name" | "email" | "message" | "consent";
export type SupportValues = Partial<Record<Exclude<SupportField, "consent">, string>> & { consent?: boolean };

export type SupportState =
  | { status: "idle"; attempt: number }
  | { status: "success"; attempt: number; worried: boolean }
  | { status: "error"; attempt: number; message: string; fieldErrors: Partial<Record<SupportField, string>>; values: SupportValues };

export const INITIAL_SUPPORT_STATE: SupportState = { status: "idle", attempt: 0 };
