import { knownRoles, type PlatformRole } from "@/lib/staff-access";

/**
 * What a staff member may see and do in admin, by platform role. Pure, so the
 * pages and actions share one answer and it can be unit tested.
 *
 * This only decides what the UI shows. Row level security decides what the
 * database allows, and every action still goes through the user client. The
 * role sets below mirror the policies in the migrations:
 *
 *   leads           0005 leads_staff_read / leads_staff_update: owner, editor, support
 *   workbooks read  0002 workbooks_read: any staff (app.is_staff)
 *   workbooks write 0002 workbooks_update and guard_workbook_status: owner, editor
 *   organisations   0001 organisations_read: any staff
 *   org create      0008 public.create_organisation: owner, editor (no table insert grant)
 *   kill switch     0008 public.set_workbook_paused: owner, editor
 *   review queue    0016 app.is_reviewer: owner, editor, safety_reviewer
 *   assign, release 0016 review_assign, release_version, overrides: owner, editor
 *   funnel counts   0016 funnel_summary: owner, editor, finance
 *   ops alerts      0016 ops_alerts_read: any staff; acknowledge: owner, editor, support
 *   support inbox   0016 support_messages_staff_read / _update: owner, editor, support
 */
export interface AdminAbilities {
  readLeads: boolean;
  updateLeads: boolean;
  readWorkbooks: boolean;
  pauseWorkbooks: boolean;
  readOrganisations: boolean;
  /** The role may create organisations (public.create_organisation, 0008). */
  createOrganisations: boolean;
  /** Review queue and validator results (0016). */
  readReviewQueue: boolean;
  /** Assign reviews, record licences, ask for and approve overrides, release (0016). */
  releaseVersions: boolean;
  readFunnel: boolean;
  readOps: boolean;
  acknowledgeOps: boolean;
  readSupport: boolean;
  updateSupport: boolean;
}

const LEAD_ROLES: readonly PlatformRole[] = ["owner", "editor", "support"];
const WORKBOOK_WRITE_ROLES: readonly PlatformRole[] = ["owner", "editor"];
const ORG_CREATE_ROLES: readonly PlatformRole[] = ["owner", "editor"];
const REVIEW_ROLES: readonly PlatformRole[] = ["owner", "editor", "safety_reviewer"];
const FUNNEL_ROLES: readonly PlatformRole[] = ["owner", "editor", "finance"];
const SUPPORT_ROLES: readonly PlatformRole[] = ["owner", "editor", "support"];

function hasAny(roles: readonly PlatformRole[], wanted: readonly PlatformRole[]): boolean {
  return roles.some((r) => wanted.includes(r));
}

export function adminAbilities(rawRoles: readonly unknown[] | null | undefined): AdminAbilities {
  const roles = knownRoles(rawRoles);
  const staff = roles.length > 0;
  return {
    readLeads: hasAny(roles, LEAD_ROLES),
    updateLeads: hasAny(roles, LEAD_ROLES),
    readWorkbooks: staff,
    pauseWorkbooks: hasAny(roles, WORKBOOK_WRITE_ROLES),
    readOrganisations: staff,
    createOrganisations: hasAny(roles, ORG_CREATE_ROLES),
    readReviewQueue: hasAny(roles, REVIEW_ROLES),
    releaseVersions: hasAny(roles, WORKBOOK_WRITE_ROLES),
    readFunnel: hasAny(roles, FUNNEL_ROLES),
    readOps: staff,
    acknowledgeOps: hasAny(roles, SUPPORT_ROLES),
    readSupport: hasAny(roles, SUPPORT_ROLES),
    updateSupport: hasAny(roles, SUPPORT_ROLES),
  };
}

/**
 * Whether the database lets staff create an organisation from a client.
 * Migration 0008 adds public.create_organisation for platform owners and
 * editors. There is still no insert grant on the table itself.
 */
export const ORGANISATION_INSERT_ALLOWED: boolean = true;
