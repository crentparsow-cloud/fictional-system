/**
 * Organisation helpers for /admin/organisations (F-082). Pure.
 */

/** Kinds staff may create. akana_house is the one seeded row and is never created again. */
export const CREATABLE_ORG_KINDS = ["publisher", "author_company", "individual"] as const;
export type CreatableOrgKind = (typeof CREATABLE_ORG_KINDS)[number];

export const ORG_KIND_LABELS: Record<string, string> = {
  akana_house: "Akana house",
  publisher: "Publisher",
  author_company: "Author company",
  individual: "Individual author",
};

export const ORG_STATUS_LABELS: Record<string, string> = {
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
  closed: "Closed",
};

export function orgKindLabel(kind: string): string {
  return ORG_KIND_LABELS[kind] ?? kind;
}

/** A URL slug from a display name, matching the organisations.slug check. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export interface OrganisationInput {
  kind: CreatableOrgKind;
  display_name: string;
  legal_name: string;
  country: string;
  slug: string;
}

export type OrganisationField = "kind" | "display_name" | "legal_name" | "country";

export type OrganisationParse =
  | { ok: true; value: OrganisationInput }
  | { ok: false; errors: Partial<Record<OrganisationField, string>> };

/** Check the create organisation form. Country is an ISO 3166 alpha-2 code such as GB. */
export function parseOrganisationForm(get: (name: string) => unknown): OrganisationParse {
  const str = (k: string) => {
    const v = get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const kind = str("kind");
  const display = str("display_name");
  const legal = str("legal_name");
  const country = str("country").toUpperCase();
  const errors: Partial<Record<OrganisationField, string>> = {};

  if (!(CREATABLE_ORG_KINDS as readonly string[]).includes(kind)) errors.kind = "Choose the kind of organisation";
  if (!display) errors.display_name = "Enter the display name";
  else if (display.length > 200) errors.display_name = "The display name must be 200 characters or fewer";
  if (!legal) errors.legal_name = "Enter the legal name";
  else if (legal.length > 300) errors.legal_name = "The legal name must be 300 characters or fewer";
  if (!/^[A-Z]{2}$/.test(country)) errors.country = "Enter a two-letter country code, like GB";

  const slug = slugify(display);
  if (display && !errors.display_name && !slug) errors.display_name = "The display name needs at least one letter or number";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { kind: kind as CreatableOrgKind, display_name: display, legal_name: legal, country, slug } };
}

/** PostgREST returns an embedded count as [{ count: n }]. Read it safely. */
export function embeddedCount(v: unknown): number {
  if (Array.isArray(v) && v.length > 0) {
    const c = (v[0] as { count?: unknown }).count;
    return typeof c === "number" ? c : 0;
  }
  return 0;
}
