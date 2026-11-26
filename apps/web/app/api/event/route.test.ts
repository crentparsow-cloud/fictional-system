import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** Review M5: /api/event is limited per address, in memory, and still answers 204 under the limit. */
const counted: string[] = [];
vi.mock("server-only", () => ({}));
vi.mock("@/lib/funnel-server", () => ({ countEvent: async (e: string) => void counted.push(e) }));

import { POST } from "./route";
import { eventIpMemory } from "@/lib/limits";
import { CLIENT_EVENTS } from "@/lib/product-events";

const EVENT = [...CLIENT_EVENTS][0];
const post = (ip: string) =>
  POST(new NextRequest("http://localhost:3000/api/event", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ event: EVENT }) }));

beforeEach(() => {
  counted.length = 0;
  eventIpMemory.reset();
});

describe("POST /api/event", () => {
  it("counts a good event", async () => {
    expect((await post("203.0.113.1")).status).toBe(204);
    expect(counted).toEqual([EVENT]);
  });

  it("stops counting one address after 300 in ten minutes and leaves others alone", async () => {
    for (let i = 0; i < 300; i++) expect((await post("203.0.113.2")).status).toBe(204);
    const over = await post("203.0.113.2");
    expect(over.status).toBe(429);
    expect(over.headers.get("cache-control")).toBe("no-store");
    expect(counted.length).toBe(300);
    expect((await post("203.0.113.3")).status).toBe(204);
  });
});
