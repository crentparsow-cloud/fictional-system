import { GENRES } from "@akana/schema";

/**
 * Choices for the enquiry form on /publish (F-001). Shared by the form, the
 * zod schema in lib/leads.ts and the notification email, so a label is
 * written once. No server-only imports: the form is a client component.
 */

export type Genre = (typeof GENRES)[number];

export const GENRE_LABELS: Record<Genre, string> = {
  wellbeing: "Wellbeing",
  personal_development: "Personal development",
  relationships: "Relationships",
  parenting: "Parenting",
  career: "Career",
  leadership: "Leadership",
  business: "Business",
  productivity: "Productivity",
  finance: "Finance",
  education: "Education",
  life_skills: "Life skills",
};

export const KINDS = ["author", "publisher", "agent", "other"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABELS: Record<Kind, string> = {
  author: "An author",
  publisher: "A publisher",
  agent: "An agent",
  other: "Other",
};

export const INTERESTS = ["marketplace", "built", "white_label", "unsure"] as const;
export type Interest = (typeof INTERESTS)[number];
export const INTEREST_LABELS: Record<Interest, string> = {
  marketplace: "A marketplace listing",
  built: "A workbook built for us",
  white_label: "Our own branded site",
  unsure: "Not sure yet",
};

/** The hidden field bots fill in. People never see it. */
export const HONEYPOT_FIELD = "website";

export const SUCCESS_MESSAGE = "Thanks. We will reply within [enquiry response time].";

export type EnquiryField =
  | "name"
  | "email"
  | "kind"
  | "organisation"
  | "book_title"
  | "book_ref"
  | "genre"
  | "interest"
  | "message"
  | "consent";

export type EnquiryValues = Partial<Record<Exclude<EnquiryField, "consent">, string>> & { consent?: boolean };

export type EnquiryState =
  | { status: "idle"; attempt: number }
  | { status: "success"; attempt: number; message: string }
  | {
      status: "error";
      attempt: number;
      message: string;
      fieldErrors: Partial<Record<EnquiryField, string>>;
      values: EnquiryValues;
    };

export const INITIAL_ENQUIRY_STATE: EnquiryState = { status: "idle", attempt: 0 };
