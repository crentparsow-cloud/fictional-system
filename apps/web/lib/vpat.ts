import { ACCESSIBILITY } from "@/lib/accessibility";

/**
 * The conformance report, in the VPAT shape (WCAG 2.2 levels A and AA).
 *
 * House rule, the same as the accessibility statement (11.5): this report
 * never claims more than has been shown. The manual pass with a keyboard,
 * VoiceOver and TalkBack has not been recorded, so no criterion is marked
 * "Supports". The words used are:
 *
 *  - Partially supports: built to meet the criterion and covered by the
 *    automated sweep where a rule exists, but not confirmed by the manual pass.
 *  - Not applicable: the product has nothing the criterion is about.
 *  - Not evaluated: nobody has looked at it yet.
 *
 * When the manual pass is recorded, change the entries it confirms, set
 * `VPAT.manualPass` and update the report date. docs/ACCESSIBILITY.md has
 * the checklist.
 */

export type Conformance = "Partially supports" | "Not applicable" | "Not evaluated";
export type Level = "A" | "AA";

export interface Criterion {
  id: string;
  name: string;
  level: Level;
  status: Conformance;
  remarks: string;
}

const PARTIAL = "Partially supports" as const;
const NA = "Not applicable" as const;
const NOT_EVAL = "Not evaluated" as const;

const c = (id: string, name: string, level: Level, status: Conformance, remarks: string): Criterion => ({ id, name, level, status, remarks });

const NO_MEDIA = "The product has no audio or video content at the date of this report.";

export const CRITERIA: readonly Criterion[] = [
  // Perceivable
  c("1.1.1", "Non-text Content", "A", PARTIAL, "Images carry text alternatives and the sweep checks for them. Whether each alternative reads well has not been reviewed by hand."),
  c("1.2.1", "Audio-only and Video-only (Prerecorded)", "A", NA, NO_MEDIA),
  c("1.2.2", "Captions (Prerecorded)", "A", NA, NO_MEDIA),
  c("1.2.3", "Audio Description or Media Alternative (Prerecorded)", "A", NA, NO_MEDIA),
  c("1.2.4", "Captions (Live)", "AA", NA, NO_MEDIA),
  c("1.2.5", "Audio Description (Prerecorded)", "AA", NA, NO_MEDIA),
  c("1.3.1", "Info and Relationships", "A", PARTIAL, "Headings, lists, landmarks and form labels are used for structure and are checked by the sweep. Ranked lists, tables, the decision matrix and the weekly grid are not yet confirmed in a screen reader."),
  c("1.3.2", "Meaningful Sequence", "A", PARTIAL, "Content is in reading order in the page source. Not yet confirmed with a screen reader."),
  c("1.3.3", "Sensory Characteristics", "A", PARTIAL, "Instructions do not rely on shape, colour or position alone. Not reviewed across every workbook."),
  c("1.3.4", "Orientation", "AA", PARTIAL, "Pages work in portrait and landscape. The sweep runs at phone and desktop widths."),
  c("1.3.5", "Identify Input Purpose", "AA", PARTIAL, "Sign-in and account fields carry autocomplete values. Workbook fields hold free answers and have no standard purpose."),
  c("1.4.1", "Use of Color", "A", PARTIAL, "Links and errors are not shown by colour alone. Checked by the sweep and by design review."),
  c("1.4.2", "Audio Control", "A", NA, NO_MEDIA),
  c("1.4.3", "Contrast (Minimum)", "AA", PARTIAL, "Checked by the sweep in light and dark on public pages. Signed-in screens are not yet in the sweep."),
  c("1.4.4", "Resize Text", "AA", PARTIAL, "Text is sized in relative units. Zoom to 200 percent is on the manual checklist and has not been recorded."),
  c("1.4.5", "Images of Text", "AA", PARTIAL, "Text is real text. Marketing screenshots show the product and are described in words."),
  c("1.4.10", "Reflow", "AA", PARTIAL, "Public pages are checked at 320 pixels wide. Signed-in screens are not yet checked."),
  c("1.4.11", "Non-text Contrast", "AA", PARTIAL, "Checked by the sweep where a rule exists. Not reviewed by hand."),
  c("1.4.12", "Text Spacing", "AA", PARTIAL, "Layouts use flexible spacing. Text spacing overrides are on the manual checklist and have not been recorded."),
  c("1.4.13", "Content on Hover or Focus", "AA", PARTIAL, "Little content appears on hover or focus. Not yet reviewed by hand."),
  // Operable
  c("2.1.1", "Keyboard", "A", PARTIAL, "Every field type is built to work from a keyboard. The full keyboard pass is on the checklist and has not been recorded."),
  c("2.1.2", "No Keyboard Trap", "A", PARTIAL, "Dialogs are built to release focus. Not yet confirmed in the manual pass."),
  c("2.1.4", "Character Key Shortcuts", "A", PARTIAL, "The product does not use single-key shortcuts. Not yet confirmed in the manual pass."),
  c("2.2.1", "Timing Adjustable", "A", PARTIAL, "Workbooks have no time limits. Sign-in links expire, and a new one can be asked for."),
  c("2.2.2", "Pause, Stop, Hide", "A", PARTIAL, "Nothing moves on its own. Reduced-motion settings are followed."),
  c("2.3.1", "Three Flashes or Below Threshold", "A", PARTIAL, "Nothing flashes by design. Not tested with a tool."),
  c("2.4.1", "Bypass Blocks", "A", PARTIAL, "A skip link on reader, Studio and organisation pages. Checked on public pages by the sweep."),
  c("2.4.2", "Page Titled", "A", PARTIAL, "Every page has a title. Checked by the sweep on public pages."),
  c("2.4.3", "Focus Order", "A", PARTIAL, "Order follows the page. Focus after Next and Back in the player is on the manual checklist and has not been recorded."),
  c("2.4.4", "Link Purpose (In Context)", "A", PARTIAL, "Links are written to make sense in context. Checked by the sweep for empty links."),
  c("2.4.5", "Multiple Ways", "AA", PARTIAL, "Search, the library and the help centre give more than one way to a page."),
  c("2.4.6", "Headings and Labels", "AA", PARTIAL, "One level-one heading a page, and labelled fields. Not reviewed for clarity across every workbook."),
  c("2.4.7", "Focus Visible", "AA", PARTIAL, "A focus outline is shown on interactive controls. Not yet confirmed in every state."),
  c("2.4.11", "Focus Not Obscured (Minimum)", "AA", NOT_EVAL, "Sticky bars could cover a focused control. No one has checked this yet."),
  c("2.5.1", "Pointer Gestures", "A", PARTIAL, "Nothing needs a multi-point or path gesture. Not yet confirmed in the manual pass."),
  c("2.5.2", "Pointer Cancellation", "A", PARTIAL, "Controls act on release, as browsers do by default. Not reviewed by hand."),
  c("2.5.3", "Label in Name", "A", PARTIAL, "Visible labels are used as the accessible names. Checked by the sweep where a rule exists."),
  c("2.5.4", "Motion Actuation", "A", NA, "Nothing in the product is operated by shaking or tilting a device."),
  c("2.5.7", "Dragging Movements", "AA", PARTIAL, "A ranked list can be reordered without dragging. Not yet confirmed in the manual pass."),
  c("2.5.8", "Target Size (Minimum)", "AA", PARTIAL, "Buttons and links on reader screens are at least 44 pixels tall. Inline links in running text are not all measured."),
  // Understandable
  c("3.1.1", "Language of Page", "A", PARTIAL, "The page language is set. Checked by the sweep."),
  c("3.1.2", "Language of Parts", "AA", PARTIAL, "Workbooks are in English. Quoted passages in other languages are not yet marked."),
  c("3.2.1", "On Focus", "A", PARTIAL, "Focus does not change the page. Not yet confirmed in the manual pass."),
  c("3.2.2", "On Input", "A", PARTIAL, "Changing a field does not submit a form or move the reader. Not yet confirmed in the manual pass."),
  c("3.2.3", "Consistent Navigation", "AA", PARTIAL, "Navigation keeps its order across reader screens. Not yet reviewed against Studio and organisation screens."),
  c("3.2.4", "Consistent Identification", "AA", PARTIAL, "The same control has the same name across screens. Not yet reviewed in full."),
  c("3.2.6", "Consistent Help", "A", PARTIAL, "Help now and the contact route sit in the same place across reader screens."),
  c("3.3.1", "Error Identification", "A", PARTIAL, "Errors are written in words next to the field. Screen reader announcements are not yet confirmed."),
  c("3.3.2", "Labels or Instructions", "A", PARTIAL, "Fields have visible labels and, where needed, help text. Checked by the sweep for missing labels."),
  c("3.3.3", "Error Suggestion", "AA", PARTIAL, "Where we know the fix, the message says it. Not every form does this yet."),
  c("3.3.4", "Error Prevention (Legal, Financial, Data)", "AA", PARTIAL, "Payment is confirmed on a page run by Stripe, which we have not tested. Cancelling and deleting an account ask for confirmation."),
  c("3.3.7", "Redundant Entry", "A", PARTIAL, "Answers carry forward where a workbook asks for the same thing again. Not reviewed in every workbook."),
  c("3.3.8", "Accessible Authentication (Minimum)", "AA", NOT_EVAL, "Sign-in has not been reviewed against this criterion yet."),
  // Robust
  c("4.1.2", "Name, Role, Value", "A", PARTIAL, "Standard controls are used, and the sweep checks names and roles. Custom field types are not yet confirmed in a screen reader."),
  c("4.1.3", "Status Messages", "AA", PARTIAL, "Saved and error messages use status regions. Not yet confirmed in a screen reader."),
];

export const VPAT = {
  title: "Conformance report",
  standard: "WCAG 2.2 levels A and AA",
  format: "Based on the VPAT layout used for the Web Content Accessibility Guidelines.",
  reportDate: "21 October 2026",
  evidence: `Automated axe sweep, last run ${ACCESSIBILITY.sweepRun}, and the design rules in docs/ACCESSIBILITY.md.`,
  manualPass: null as string | null,
  scope:
    "The public pages, the reader screens (Library, Today, the workbook player, You) and the Studio and organisation consoles. Payment pages run by Stripe are outside this report.",
  summary:
    "We do not yet claim that any criterion is fully met. The manual pass with a keyboard, VoiceOver and TalkBack has not been recorded. Until it is, the best result in this report is Partially supports.",
  terms: [
    { term: "Partially supports", meaning: "Built to meet the criterion, and covered by the automated sweep where a rule exists. Not yet confirmed by the manual pass." },
    { term: "Not applicable", meaning: "The product has nothing the criterion is about." },
    { term: "Not evaluated", meaning: "Nobody has looked at this yet." },
  ],
  limits: [
    "The automated sweep covers public pages only. Signed-in screens are covered by the manual pass, which is not yet done.",
    "An automated tool finds a minority of the problems a person using assistive technology would meet.",
    "Authors write the words inside a workbook. We check structure and not every choice of wording.",
  ],
  contactRoute: ACCESSIBILITY.contact.route,
} as const;

export interface Tally {
  total: number;
  partial: number;
  notApplicable: number;
  notEvaluated: number;
}

export function tally(list: readonly Criterion[] = CRITERIA): Tally {
  return {
    total: list.length,
    partial: list.filter((x) => x.status === PARTIAL).length,
    notApplicable: list.filter((x) => x.status === NA).length,
    notEvaluated: list.filter((x) => x.status === NOT_EVAL).length,
  };
}

export function byLevel(level: Level, list: readonly Criterion[] = CRITERIA): Criterion[] {
  return list.filter((x) => x.level === level);
}

/** Criteria grouped under the four WCAG principles, from the first digit of the number. */
export const PRINCIPLES = [
  { n: "1", name: "Perceivable" },
  { n: "2", name: "Operable" },
  { n: "3", name: "Understandable" },
  { n: "4", name: "Robust" },
] as const;

export function byPrinciple(n: string, list: readonly Criterion[] = CRITERIA): Criterion[] {
  return list.filter((x) => x.id.startsWith(`${n}.`));
}
