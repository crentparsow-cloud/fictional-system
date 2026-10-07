/**
 * Notice and counter-notice form state, shared by the client forms and the
 * server actions (F-123). No server imports, so the client bundle stays small.
 */
export type NoticeField =
  | "basis"
  | "relationship"
  | "acting_for"
  | "name"
  | "email"
  | "address"
  | "phone"
  | "work"
  | "location"
  | "explanation"
  | "good_faith"
  | "accurate"
  | "jurisdiction"
  | "signature"
  | "reference";

export type NoticeValues = Partial<Record<Exclude<NoticeField, "good_faith" | "accurate" | "jurisdiction">, string>> & {
  good_faith?: boolean;
  accurate?: boolean;
  jurisdiction?: boolean;
};

export type NoticeState =
  | { status: "idle"; attempt: number }
  | { status: "success"; attempt: number; reference: string }
  | { status: "error"; attempt: number; message: string; fieldErrors: Partial<Record<NoticeField, string>>; values: NoticeValues };

export const INITIAL_NOTICE_STATE: NoticeState = { status: "idle", attempt: 0 };

export const NOTICE_BASES = ["copyright", "trade_mark", "other_illegal"] as const;
export type NoticeBasis = (typeof NOTICE_BASES)[number];

export const BASIS_LABELS: Record<NoticeBasis, string> = {
  copyright: "Copyright",
  trade_mark: "Trade mark",
  other_illegal: "Other unlawful content",
};
