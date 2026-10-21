import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateWorkbook, type Finding } from "./index";

/**
 * Which workbook files `pnpm validate` scans by default (10.10), and the
 * validation run behind it. Kept out of index.ts because it reads the disk.
 *
 * The default scan is every JSON file in content/workbooks/v3 (the 20 Maya
 * Vaughn workbooks) and content/workbooks/classics (written-up public-domain
 * titles). Each folder is optional, so a checkout without classics still scans v3.
 */

/** Folders under content/workbooks scanned when no file is named, in scan order. */
export const WORKBOOK_DIRS = ["v3", "classics"] as const;

export function contentTargets(root: string): string[] {
  return WORKBOOK_DIRS.map((d) => join(root, "content", "workbooks", d))
    .filter(existsSync)
    .flatMap((dir) =>
      readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => join(dir, f)),
    );
}

export interface FileValidation {
  file: string;
  status: string | undefined;
  ok: boolean;
  /** Findings that fail the run. */
  blocking: Finding[];
  /** Everything else, including parked errors downgraded to warnings. */
  warnings: Finding[];
}

export interface ValidateTargetsOptions {
  lenient?: boolean;
  /** An in_review file fails only on schema and reference errors (the CI default for the parked Maya Vaughn files). */
  parked?: boolean;
}

/** Validate each file. A file that is not valid JSON counts as a schema error. */
export function validateTargets(files: string[], opts: ValidateTargetsOptions = {}): FileValidation[] {
  return files.map((file) => {
    let doc: { status?: string };
    try {
      doc = JSON.parse(readFileSync(file, "utf8")) as { status?: string };
    } catch (err) {
      const message = `not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
      return { file, status: undefined, ok: false, blocking: [{ severity: "error", category: "schema", path: "$", message }], warnings: [] };
    }
    const result = validateWorkbook(doc, { lenient: opts.lenient });
    const parked = Boolean(opts.parked) && doc.status === "in_review";
    const blocking = parked ? result.errors.filter((e) => e.category === "schema" || e.category === "refs") : result.errors;
    const downgraded = result.errors.filter((e) => !blocking.includes(e)).map((e): Finding => ({ ...e, severity: "warning" }));
    return { file, status: doc.status, ok: blocking.length === 0, blocking, warnings: [...result.warnings, ...downgraded] };
  });
}
