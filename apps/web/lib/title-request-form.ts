/**
 * Title request form state shared by the client form and the server action
 * (build list 2.8). No server imports, so the client bundle stays small.
 */
export type TitleRequestField = "title" | "author" | "note";
export type TitleRequestValues = Partial<Record<TitleRequestField, string>>;

export type TitleRequestState =
  | { status: "idle"; attempt: number }
  | { status: "success"; attempt: number }
  | { status: "error"; attempt: number; message: string; fieldErrors: Partial<Record<TitleRequestField, string>>; values: TitleRequestValues };

export const INITIAL_TITLE_REQUEST_STATE: TitleRequestState = { status: "idle", attempt: 0 };
