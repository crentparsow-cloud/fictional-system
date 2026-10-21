import { HELP_TOPICS, type HelpTopic } from "@/lib/help";

/**
 * The help centre by task (7.8). People arrive with a job to do ("cancel my
 * membership", "stop the emails"), not a topic name, so the index lists the
 * jobs under plain group headings and the search matches them by the words a
 * person would use. Each task points at a help page and, where it helps, the
 * section on that page. Pure, so every task is checked against the real pages.
 */

export const TASK_GROUPS = ["Getting started", "Money and membership", "Your work and your privacy", "Groups and organisations", "Support and safety"] as const;
export type TaskGroup = (typeof TASK_GROUPS)[number];

export interface HelpTask {
  /** Starts with a verb, in the reader's words. */
  label: string;
  group: TaskGroup;
  topic: HelpTopic;
  /** The heading on that page where the answer starts. Must exist in the page. */
  section?: string;
  /** Other words people use for the same job. */
  keywords: readonly string[];
}

export const HELP_TASKS: readonly HelpTask[] = [
  { label: "Sign in or get a new sign-in link", group: "Getting started", topic: "account", section: "Signing in", keywords: ["log in", "login", "magic link", "code", "password", "email link", "cannot get in"] },
  { label: "Put Akana on my phone's home screen", group: "Getting started", topic: "install", keywords: ["install", "app", "iphone", "android", "shortcut", "icon"] },
  { label: "Change text size, colours or font", group: "Getting started", topic: "appearance", section: "What you can change", keywords: ["bigger", "larger", "dark mode", "dyslexia", "reading settings", "contrast"] },
  { label: "Have a workbook read aloud to me", group: "Getting started", topic: "read-aloud", section: "How to use it", keywords: ["listen", "voice", "audio", "speak", "screen reader"] },
  { label: "Sign up for the weekly newsletter", group: "Getting started", topic: "newsletter", section: "Signing up", keywords: ["email", "subscribe", "exercise", "confirm"] },
  { label: "Stop the weekly newsletter", group: "Getting started", topic: "newsletter", section: "Stopping it", keywords: ["unsubscribe", "emails", "stop emails", "opt out"] },

  { label: "See what the membership includes", group: "Money and membership", topic: "membership", section: "What it includes", keywords: ["join", "subscription", "price", "cost", "plan"] },
  { label: "Understand the trial", group: "Money and membership", topic: "membership", section: "The trial", keywords: ["try", "first payment"] },
  { label: "Find out when my membership renews", group: "Money and membership", topic: "membership", section: "How it renews", keywords: ["renewal", "next payment", "billing date", "charge"] },
  { label: "Update my card or manage my membership", group: "Money and membership", topic: "membership", section: "Managing your membership", keywords: ["payment method", "invoice", "receipt", "change plan", "pause"] },
  { label: "Fix a failed payment", group: "Money and membership", topic: "membership", section: "If a payment fails", keywords: ["declined", "card expired", "payment problem", "past due"] },
  { label: "Give someone a membership", group: "Money and membership", topic: "gift-memberships", section: "How it works", keywords: ["gift", "present", "buy for a friend", "voucher"] },
  { label: "Get the student price", group: "Money and membership", topic: "student-price", section: "How to get it", keywords: ["student", "university", "discount", "academic email"] },
  { label: "Cancel my membership", group: "Money and membership", topic: "cancelling", section: "How to cancel", keywords: ["end", "stop paying", "quit", "leave"] },
  { label: "Ask for a refund", group: "Money and membership", topic: "refunds", section: "Asking for a refund", keywords: ["money back", "repay", "charged by mistake"] },
  { label: "Check whether a single workbook can be refunded", group: "Money and membership", topic: "refunds", section: "Single workbooks", keywords: ["buy", "purchase", "return"] },

  { label: "Download my work", group: "Your work and your privacy", topic: "account", section: "Download your work", keywords: ["export", "copy", "backup", "keep my answers"] },
  { label: "Delete my account", group: "Your work and your privacy", topic: "account", section: "Delete your account", keywords: ["remove", "close account", "erase everything"] },
  { label: "Find out who can see what I write", group: "Your work and your privacy", topic: "privacy", section: "Your answers", keywords: ["private", "answers", "confidential", "sealed"] },
  { label: "Change which emails I get", group: "Your work and your privacy", topic: "privacy", section: "Emails", keywords: ["reminders", "marketing", "notifications", "unsubscribe", "stop emails"] },
  { label: "Understand cookies and tracking", group: "Your work and your privacy", topic: "privacy", section: "Cookies and tracking", keywords: ["analytics", "pixels", "adverts", "consent"] },
  { label: "Use my rights over my data", group: "Your work and your privacy", topic: "privacy", section: "Your rights", keywords: ["gdpr", "access request", "correct", "complain", "erasure"] },
  { label: "Agree to store health information", group: "Your work and your privacy", topic: "account", section: "Wellbeing workbooks", keywords: ["consent", "wellbeing", "withdraw consent"] },

  { label: "Join a group", group: "Groups and organisations", topic: "groups", section: "Joining a group", keywords: ["invite link", "code", "team", "church"] },
  { label: "See what a group leader can see", group: "Groups and organisations", topic: "groups", section: "What the group can see", keywords: ["private", "leader", "visible"] },
  { label: "Lead a group", group: "Groups and organisations", topic: "groups", section: "If you lead a group", keywords: ["organiser", "schedule", "run a group"] },
  { label: "Get a place from my employer, church or charity", group: "Groups and organisations", topic: "organisations", section: "Getting a place", keywords: ["seat", "work", "licence", "invitation"] },
  { label: "Manage seats for my organisation", group: "Groups and organisations", topic: "organisations", section: "If you manage seats", keywords: ["admin", "add people", "remove people", "billing"] },
  { label: "Run a book club with a workbook", group: "Groups and organisations", topic: "book-clubs", section: "Finding a programme for a group", keywords: ["reading group", "meeting", "discussion", "friends"] },
  { label: "Ask my church to use Akana", group: "Groups and organisations", topic: "book-clubs", section: "Telling your minister", keywords: ["minister", "vicar", "pastor", "priest", "template email"] },

  { label: "Invite a check-in partner", group: "Support and safety", topic: "check-in-partner", section: "Inviting someone", keywords: ["accountability", "friend", "share progress", "buddy"] },
  { label: "Stop sharing with a check-in partner", group: "Support and safety", topic: "check-in-partner", section: "Stopping", keywords: ["remove partner", "end sharing"] },
  { label: "Find free support lines", group: "Support and safety", topic: "help-now", section: "Where to find it", keywords: ["crisis", "emergency", "samaritans", "urgent", "in danger", "struggling"] },
  { label: "Report a concern about a group", group: "Support and safety", topic: "groups", section: "Reporting a concern", keywords: ["complaint", "worried", "safeguarding", "abuse"] },
];

const STOP = new Set(["a", "an", "the", "i", "me", "my", "to", "of", "for", "how", "do", "can", "want", "need", "and", "or", "in", "on", "is", "it", "get", "with", "from", "about"]);

/** A rough stem: plurals and -ing/-ed endings, so "cancelling" finds "cancel". */
export function stem(word: string): string {
  let w = word.toLowerCase();
  const before = w;
  if (w.length > 6 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 5 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  // "cancelling" and "cancelled" both settle on "cancel": undo a doubled letter left by an ending.
  return w !== before && w.length > 4 && /([a-z])\1$/.test(w) ? w.slice(0, -1) : w;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/'s$/, "").replace(/^'+|'+$/g, ""))
    .filter((w) => w && !STOP.has(w))
    .map(stem);
}

export interface TaskMatch {
  task: HelpTask;
  score: number;
}

/**
 * Tasks that match what the person typed, best first. A word in the task
 * wording counts most, a word in its other words next, and a word in the
 * group or topic name least. An empty or all-filler query matches nothing.
 */
export function searchTasks(query: string, tasks: readonly HelpTask[] = HELP_TASKS): TaskMatch[] {
  const words = tokens(query);
  if (!words.length) return [];
  const out: TaskMatch[] = [];
  for (const task of tasks) {
    const label = new Set(tokens(task.label));
    const keys = new Set(task.keywords.flatMap((k) => tokens(k)));
    const meta = new Set(tokens(`${task.group} ${task.topic.replace(/-/g, " ")} ${task.section ?? ""}`));
    let score = 0;
    let matched = 0;
    for (const w of words) {
      const s = label.has(w) ? 3 : keys.has(w) ? 2 : meta.has(w) ? 1 : 0;
      if (s) matched += 1;
      score += s;
    }
    // Every word must find something, or the task is not what they meant.
    if (matched === words.length) out.push({ task, score });
  }
  return out.sort((a, b) => b.score - a.score || tasks.indexOf(a.task) - tasks.indexOf(b.task));
}

/** Tasks grouped under the five headings, in order. */
export function tasksByGroup(tasks: readonly HelpTask[] = HELP_TASKS): { group: TaskGroup; tasks: HelpTask[] }[] {
  return TASK_GROUPS.map((group) => ({ group, tasks: tasks.filter((t) => t.group === group) })).filter((g) => g.tasks.length);
}

export const taskHref = (t: HelpTask): string => `/help/${t.topic}`;

/** Topics that no task points at. Kept at zero by the tests, so a new page cannot be orphaned. */
export function topicsWithoutTask(tasks: readonly HelpTask[] = HELP_TASKS): HelpTopic[] {
  const used = new Set(tasks.map((t) => t.topic));
  return HELP_TOPICS.filter((t) => !used.has(t));
}
