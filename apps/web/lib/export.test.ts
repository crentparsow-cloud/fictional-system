import { describe, expect, it } from "vitest";
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  buildExport,
  escapeHtml,
  exportFileName,
  exportJson,
  labelsFromUnitSections,
  partnerForExport,
  placeAnswer,
  renderExportHtml,
  valueLines,
  type ExportEnrolmentInput,
} from "./export";

const sections = [
  {
    unit_number: 1,
    body: {
      number: 1,
      focus: "Start small",
      exercises: [
        { id: "plan_first_step", title: "Plan the first step", fields: [{ id: "what", label: "What will you do?" }, { id: "when", label: "When?" }] },
      ],
    },
  },
  { unit_number: 2, body: { number: 2, exercises: [{ id: "review", title: "Look back", fields: [{ id: "notes" }] }] } },
  { unit_number: 3, body: "not an object" },
];

const labels = labelsFromUnitSections(sections);
const now = new Date("2026-10-07T09:00:00Z");

const enrolA: ExportEnrolmentInput = {
  id: "e1",
  workbookCode: "AK-ABCDE",
  workbookTitle: "Steady Nights",
  status: "active",
  startedAt: "2026-09-01T08:00:00Z",
  labels,
};

describe("labels from unit sections", () => {
  it("indexes exercises by id with unit and field labels", () => {
    expect(labels.plan_first_step).toEqual({ title: "Plan the first step", unit: 1, fields: { what: "What will you do?", when: "When?" } });
    expect(labels.review).toEqual({ title: "Look back", unit: 2, fields: {} });
  });
  it("skips malformed bodies", () => {
    expect(Object.keys(labels)).toEqual(["plan_first_step", "review"]);
  });
});

describe("placing an answer", () => {
  it("resolves exercise answers and repeats", () => {
    expect(placeAnswer("exercise:plan_first_step.what", labels)).toMatchObject({
      unit: 1, exercise_id: "plan_first_step", exercise_title: "Plan the first step", field_id: "what", field_label: "What will you do?",
    });
    expect(placeAnswer("exercise:plan_first_step~r.what", labels)).toMatchObject({ exercise_id: "plan_first_step", scope: "plan_first_step~r", unit: 1 });
  });
  it("falls back to ids when labels are unavailable", () => {
    expect(placeAnswer("exercise:locked_ex.f1", labels)).toEqual({
      unit: null, exercise_id: "locked_ex", exercise_title: null, scope: "locked_ex", field_id: "f1", field_label: null,
    });
    expect(placeAnswer("exercise:review.notes", labels).field_label).toBeNull();
  });
  it("reads the unit from a check-in scope", () => {
    expect(placeAnswer("checkin:3.mood", labels)).toMatchObject({ unit: 3, exercise_id: null, scope: "checkin:3", field_id: "mood" });
  });
  it("leaves screen scopes and odd paths unplaced", () => {
    expect(placeAnswer("start.why", labels)).toMatchObject({ unit: null, exercise_id: null, scope: "start", field_id: "why" });
    expect(placeAnswer("nodot", labels)).toMatchObject({ unit: null, scope: "nodot", field_id: "nodot" });
  });
});

describe("building the export", () => {
  const doc = buildExport(
    [enrolA],
    [
      { enrolmentId: "e1", field: "checkin:3.mood", value: 4, updatedAt: "2026-09-20T10:00:00Z" },
      { enrolmentId: "e1", field: "exercise:plan_first_step.what", value: "Walk at lunch", updatedAt: "2026-09-02T10:00:00Z" },
      { enrolmentId: "e1", field: "start.why", value: "Sleep better", updatedAt: "2026-09-01T10:00:00Z" },
      { enrolmentId: "someone-else", field: "exercise:plan_first_step.what", value: "not mine", updatedAt: "2026-09-02T10:00:00Z" },
    ],
    { e1: 1 },
    now,
  );

  it("has the documented top-level shape", () => {
    expect(doc.format).toBe(EXPORT_FORMAT);
    expect(doc.version).toBe(EXPORT_VERSION);
    expect(doc.exported_at).toBe("2026-10-07T09:00:00.000Z");
    expect(doc.workbooks).toHaveLength(1);
    expect(Object.keys(doc.workbooks[0]!)).toEqual(["workbook_code", "workbook_title", "status", "started_at", "answers", "unreadable"]);
    expect(Object.keys(doc.workbooks[0]!.answers[0]!)).toEqual([
      "unit", "exercise_id", "exercise_title", "scope", "field_id", "field_label", "value", "updated_at", "field_type", "display",
    ]);
  });

  it("never carries answers from an enrolment it was not given", () => {
    expect(JSON.stringify(doc)).not.toContain("not mine");
    expect(doc.workbooks[0]!.answers).toHaveLength(3);
  });

  it("orders by unit, with unplaced answers last", () => {
    expect(doc.workbooks[0]!.answers.map((a) => a.scope)).toEqual(["plan_first_step", "checkin:3", "start"]);
    expect(doc.workbooks[0]!.unreadable).toBe(1);
  });

  it("round-trips as JSON", () => {
    expect(JSON.parse(exportJson(doc))).toEqual(doc);
  });
});

describe("value lines", () => {
  it("formats the field types the engine saves", () => {
    expect(valueLines("a\nb")).toEqual(["a\nb"]);
    expect(valueLines("  ")).toEqual([]);
    expect(valueLines(null)).toEqual([]);
    expect(valueLines(true)).toEqual(["Yes"]);
    expect(valueLines(3.5)).toEqual(["3.5"]);
    expect(valueLines(["one", "two"])).toEqual(["one", "two"]);
    expect(valueLines({ cost: 5, note: "x" })).toEqual(["cost: 5", "note: x"]);
    expect(valueLines([{ a: 1, b: "y" }])).toEqual(["a: 1; b: y"]);
  });
});

describe("printable page", () => {
  const doc = buildExport(
    [enrolA, { ...enrolA, id: "e2", workbookCode: null, workbookTitle: null, labels: {} }],
    [
      { enrolmentId: "e1", field: "exercise:plan_first_step.what", value: "<script>alert(1)</script>", updatedAt: "2026-09-02T10:00:00Z" },
      { enrolmentId: "e2", field: "exercise:hidden_ex.f1", value: "Kept", updatedAt: "2026-09-02T10:00:00Z" },
    ],
    {},
    now,
  );

  it("escapes what the reader wrote", () => {
    const html = renderExportHtml(doc, { showTitles: true });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(escapeHtml(`"'&`)).toBe("&quot;&#39;&amp;");
  });

  it("resolves headings and falls back to ids", () => {
    const html = renderExportHtml(doc, { showTitles: true });
    expect(html).toContain("<h2>Steady Nights</h2>");
    expect(html).toContain("<h3>Unit 1</h3>");
    expect(html).toContain("<h4>Plan the first step</h4>");
    expect(html).toContain("What will you do?");
    expect(html).toContain("<h2>Workbook 2</h2>");
    expect(html).toContain("<h4>hidden_ex</h4>");
    expect(html).toContain(">f1<");
  });

  it("keeps the header neutral unless the reader asks for titles", () => {
    const html = renderExportHtml(doc, { showTitles: false });
    expect(html).toContain("<title>My work</title>");
    expect(html).not.toContain("Steady Nights");
    expect(html).toContain("<h2>Workbook AK-ABCDE</h2>");
  });

  it("has no scripts or outside requests", () => {
    const html = renderExportHtml(doc, { showTitles: true });
    expect(html).not.toMatch(/<script|<link|https?:\/\//i);
  });

  it("uses neutral, dated file names", () => {
    expect(exportFileName("json", now)).toBe("akana-my-work-2026-10-07.json");
    expect(exportFileName("html", now)).toBe("akana-my-work-2026-10-07.html");
  });
});

describe("v3 figure fields in the export (F-113)", () => {
  const typed = labelsFromUnitSections([
    {
      unit_number: 1,
      body: {
        number: 1,
        exercises: [
          {
            id: "month_map",
            title: "Map your month",
            fields: [
              { id: "take_home", type: "currency", label: "Take-home pay", unit: "GBP" },
              { id: "outgoings", type: "table", label: "What goes out", columns: ["Item", "Amount"], computed: "sum", unit: "GBP" },
              { id: "choice", type: "decision_matrix", label: "Your options", columns: ["Cost", "Ease"], computed: "weighted_sum" },
              { id: "note", type: "short_text", label: "A note" },
              { id: "odd", type: "hologram", label: "Unknown type" },
            ],
          },
        ],
      },
    },
  ]);
  const doc = buildExport(
    [{ ...enrolA, labels: typed }],
    [
      { enrolmentId: "e1", field: "exercise:month_map.take_home", value: 2150.5, updatedAt: "2026-10-01T10:00:00Z" },
      { enrolmentId: "e1", field: "exercise:month_map.outgoings", value: [["Rent", 900], ["Food <b>", 250.25]], updatedAt: "2026-10-01T10:00:00Z" },
      {
        enrolmentId: "e1",
        field: "exercise:month_map.choice",
        value: { options: ["Stay", "Move"], weights: [3, null], scores: [[4, 2], [2, 5]] },
        updatedAt: "2026-10-01T10:00:00Z",
      },
      { enrolmentId: "e1", field: "exercise:month_map.note", value: "Plain", updatedAt: "2026-10-01T10:00:00Z" },
      { enrolmentId: "e1", field: "exercise:month_map.odd", value: 3, updatedAt: "2026-10-01T10:00:00Z" },
    ],
    {},
    now,
  );
  const byId = (id: string) => doc.workbooks[0]!.answers.find((a) => a.field_id === id)!;

  it("keeps field settings from the section, ignoring unknown types", () => {
    expect(typed.month_map?.defs?.outgoings).toEqual({ type: "table", label: "What goes out", columns: ["Item", "Amount"], computed: "sum", unit: "GBP" });
    expect(typed.month_map?.defs?.odd).toBeUndefined();
  });

  it("adds the field type and a formatted display, keeping the saved value as is", () => {
    expect(byId("take_home")).toMatchObject({ value: 2150.5, field_type: "currency", display: { kind: "lines", lines: ["£2,150.50"] } });
    expect(byId("outgoings").display).toEqual({
      kind: "table",
      head: ["Item", "Amount"],
      rows: [
        ["Rent", "£900.00"],
        ["Food <b>", "£250.25"],
      ],
      foot: ["Total", "£1,150.25"],
      caption: null,
    });
    expect(byId("choice").display).toMatchObject({ kind: "table", caption: "Highest score: Stay" });
    expect(byId("note")).toMatchObject({ field_type: "short_text", display: null });
    expect(byId("odd")).toMatchObject({ field_type: null, display: null });
  });

  it("prints tables as tables, escaped, with totals", () => {
    const html = renderExportHtml(doc, { showTitles: false });
    expect(html).toContain("<p>£2,150.50</p>");
    expect(html).toContain('<th scope="col">Amount</th>');
    expect(html).toContain('<th scope="row">Food &lt;b&gt;</th><td>£250.25</td>');
    expect(html).toContain('<tfoot><tr><th scope="row">Total</th><td>£1,150.25</td></tr></tfoot>');
    expect(html).toContain("Highest score: Stay");
    expect(html).not.toMatch(/<script|<link|https?:\/\//i);
  });
});

describe("check-in partner in the export (F-030)", () => {
  const input = {
    partner_name: "Sam",
    share_level: 3,
    status: "accepted",
    // Extra columns the route never selects, to prove they cannot slip through.
    partner_email: "sam@example.com",
    note: "my private note",
    replies: [
      { body: "Proud of you.", created_at: "2026-10-03T09:00:00Z" },
      { body: "Thinking of you.", created_at: "2026-10-01T09:00:00Z" },
      { body: "", created_at: "2026-10-02T09:00:00Z" },
    ],
  };

  it("keeps the name, share level, status and kind words, oldest first, and nothing else", () => {
    const p = partnerForExport(input);
    expect(p).toEqual({
      partner_name: "Sam",
      share_level: 3,
      share_level_label: "Stage, nudge and a short note",
      status: "accepted",
      kind_words: [
        { body: "Thinking of you.", received_at: "2026-10-01T09:00:00Z" },
        { body: "Proud of you.", received_at: "2026-10-03T09:00:00Z" },
      ],
    });
    const json = exportJson(buildExport([], [], {}, new Date("2026-10-08T09:00:00Z"), p));
    expect(json).not.toContain("sam@example.com");
    expect(json).not.toContain("my private note");
    expect(JSON.parse(json).check_in_partner.partner_name).toBe("Sam");
  });

  it("is null without a partner or with a malformed row", () => {
    expect(partnerForExport(null)).toBeNull();
    expect(partnerForExport({ ...input, share_level: 7 })).toBeNull();
    expect(partnerForExport({ ...input, partner_name: "" })).toBeNull();
    expect(buildExport([], [], {}, new Date()).check_in_partner).toBeNull();
  });

  it("prints a plain partner section, escaped", () => {
    const p = partnerForExport({ ...input, partner_name: "Sam", replies: [{ body: "You & me <3", created_at: "2026-10-01T09:00:00Z" }] });
    const html = renderExportHtml(buildExport([], [], {}, new Date("2026-10-08T09:00:00Z"), p), { showTitles: false });
    expect(html).toContain("<h2>Check-in partner</h2>");
    expect(html).toContain("You &amp; me &lt;3");
    expect(html).toContain("Accepted");
    expect(renderExportHtml(buildExport([], [], {}, new Date()), { showTitles: false })).not.toContain("Check-in partner");
  });
});
