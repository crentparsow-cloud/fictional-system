import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getStaffSession = vi.fn();
vi.mock("@/lib/staff", () => ({ getStaffSession, getStaffAccess: vi.fn() }));


describe("/dev/player gate (L3)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getStaffSession.mockReset();
    vi.resetModules();
  });

  it("outside production it is open and does not look for a session", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { default: Page } = await import("./page");
    await expect(Page()).resolves.toBeTruthy();
    expect(getStaffSession).not.toHaveBeenCalled();
  });

  it("in production asks for a staff session and renders nothing when it is refused", async () => {
    vi.stubEnv("NODE_ENV", "production");
    getStaffSession.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    const { default: Page } = await import("./page");
    await expect(Page()).rejects.toThrow("404");
    expect(getStaffSession).toHaveBeenCalledWith("/dev/player");
  });
});
