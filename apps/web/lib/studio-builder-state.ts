/**
 * Builder form state shared by the client form and the server action
 * (build list 8.2). No server imports.
 */
export interface BuilderFinding {
  where: string;
  message: string;
}

export type BuilderState =
  | { status: "idle" }
  | {
      status: "checked" | "error";
      message: string;
      issues: BuilderFinding[];
      errors: BuilderFinding[];
      warnings: BuilderFinding[];
    };

export const INITIAL_BUILDER_STATE: BuilderState = { status: "idle" };
