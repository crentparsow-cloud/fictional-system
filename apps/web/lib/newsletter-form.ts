/** The state the admin newsletter form passes between the server action and the page. Types and a constant only. */
export interface IssueFormValues {
  id: string;
  subject: string;
  preheader: string;
  intro: string;
  exercise_heading: string;
  exercise_body: string;
  sponsor_name: string;
  sponsor_text: string;
  sponsor_url: string;
  send_at: string;
}

export type IssueFormState =
  | { status: "idle" }
  | { status: "ok"; message: string; warnings: string[] }
  | { status: "error"; errors: string[]; warnings: string[]; values: IssueFormValues };

export const INITIAL_ISSUE_STATE: IssueFormState = { status: "idle" };

export const EMPTY_ISSUE: IssueFormValues = {
  id: "",
  subject: "",
  preheader: "",
  intro: "",
  exercise_heading: "",
  exercise_body: "",
  sponsor_name: "",
  sponsor_text: "",
  sponsor_url: "",
  send_at: "",
};
