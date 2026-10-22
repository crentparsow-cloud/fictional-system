import { describe, expect, it } from "vitest";
import { HELP_TOPICS, readHelpMarkdown } from "./help";
import { HELP_TASKS, TASK_GROUPS, searchTasks, stem, taskHref, tasksByGroup, topicsWithoutTask } from "./help-tasks";

describe("help centre by task (7.8)", () => {
  it("points every task at a real page and a real heading on it", () => {
    for (const t of HELP_TASKS) {
      expect(HELP_TOPICS as readonly string[], t.label).toContain(t.topic);
      if (t.section) expect(readHelpMarkdown(t.topic), `${t.label} -> ${t.section}`).toMatch(new RegExp(`^##+ ${t.section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"));
    }
  });

  it("leaves no help page without a task, and no task without a group", () => {
    expect(topicsWithoutTask()).toEqual([]);
    for (const t of HELP_TASKS) expect(TASK_GROUPS).toContain(t.group);
    expect(tasksByGroup().map((g) => g.group)).toEqual([...TASK_GROUPS]);
  });

  it("writes each task as something to do, in plain words, with no dashes", () => {
    const labels = HELP_TASKS.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const l of labels) {
      expect(l).toMatch(/^[A-Z]/);
      expect(l).not.toMatch(/—|–|\?$/);
    }
  });

  it("finds a task by the words a person would use", () => {
    expect(searchTasks("cancel")[0]?.task.label).toBe("Cancel my membership");
    expect(searchTasks("how do I cancel my membership")[0]?.task.label).toBe("Cancel my membership");
    expect(searchTasks("cancelling")[0]?.task.label).toBe("Cancel my membership");
    expect(searchTasks("log in")[0]?.task.label).toBe("Sign in or get a new sign-in link");
    expect(searchTasks("money back")[0]?.task.label).toBe("Ask for a refund");
    expect(searchTasks("unsubscribe")[0]?.task.topic).toMatch(/newsletter|privacy/);
    expect(searchTasks("minister")[0]?.task.label).toBe("Ask my church to use Akana");
    expect(searchTasks("delete my account")[0]?.task.label).toBe("Delete my account");
    expect(searchTasks("download my answers").map((m) => m.task.label)).toContain("Download my work");
  });

  it("matches nothing for an empty, filler-only or unrelated query", () => {
    expect(searchTasks("")).toEqual([]);
    expect(searchTasks("how do I")).toEqual([]);
    expect(searchTasks("zebra spreadsheet")).toEqual([]);
  });

  it("needs every word to find something", () => {
    expect(searchTasks("cancel zebra")).toEqual([]);
  });

  it("stems plurals and endings", () => {
    expect(stem("cancelling")).toBe(stem("cancel"));
    expect(stem("cancelled")).toBe(stem("cancel"));
    expect(stem("refunds")).toBe("refund");
    expect(stem("class")).toBe("class");
  });

  it("links a task to its page", () => {
    expect(taskHref(HELP_TASKS[0]!)).toBe("/help/account");
  });
});
