import { describe, expect, it } from "vitest";
import { toastForTransition } from "./motion";

describe("the save toast follows autosave", () => {
  it("says saved only after something was owed", () => {
    expect(toastForTransition("saving", "saved")).toBe("saved");
    expect(toastForTransition("unsaved", "saved")).toBe("saved");
    expect(toastForTransition("retrying", "saved")).toBe("saved");
    expect(toastForTransition("idle", "saved")).toBeNull();
  });
  it("says not saved when a save gives up", () => {
    expect(toastForTransition("retrying", "failed")).toBe("failed");
  });
  it("stays quiet otherwise", () => {
    expect(toastForTransition("saved", "saved")).toBeNull();
    expect(toastForTransition("saved", "unsaved")).toBeNull();
    expect(toastForTransition("unsaved", "saving")).toBeNull();
  });
});
