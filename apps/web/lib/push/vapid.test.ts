import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { audienceOf, pushHeaders, vapidFromEnv, vapidJwt, type VapidConfig } from "@/lib/push/vapid";

function makePair(): VapidConfig {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pub = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const priv = privateKey.export({ format: "jwk" }) as { d: string };
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]);
  return { publicKey: raw.toString("base64url"), privateKey: priv.d, subject: "mailto:ops@akana.example" };
}

describe("vapidFromEnv", () => {
  const good = makePair();
  const env = { VAPID_PUBLIC_KEY: good.publicKey, VAPID_PRIVATE_KEY: good.privateKey, VAPID_SUBJECT: good.subject };
  it("reads a complete configuration", () => {
    expect(vapidFromEnv(env)).toEqual(good);
  });
  it("is null while anything is blank or malformed", () => {
    expect(vapidFromEnv({})).toBeNull();
    expect(vapidFromEnv({ ...env, VAPID_PRIVATE_KEY: "" })).toBeNull();
    expect(vapidFromEnv({ ...env, VAPID_SUBJECT: "" })).toBeNull();
    expect(vapidFromEnv({ ...env, VAPID_PUBLIC_KEY: "short" })).toBeNull();
    expect(vapidFromEnv({ ...env, VAPID_PRIVATE_KEY: good.privateKey.slice(0, 20) })).toBeNull();
    expect(vapidFromEnv({ ...env, VAPID_SUBJECT: "ops at akana" })).toBeNull();
    expect(vapidFromEnv({ ...env, VAPID_SUBJECT: "https://akana.example/contact" })?.subject).toBe("https://akana.example/contact");
  });
});

describe("vapidJwt", () => {
  const cfg = makePair();
  const now = new Date("2026-11-02T08:00:00Z");
  it("signs a token the public key verifies, with the audience, expiry and subject", () => {
    const jwt = vapidJwt(cfg, "https://push.example", now);
    const [h, b, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ typ: "JWT", alg: "ES256" });
    const body = JSON.parse(Buffer.from(b!, "base64url").toString());
    expect(body.aud).toBe("https://push.example");
    expect(body.sub).toBe("mailto:ops@akana.example");
    expect(body.exp).toBe(Math.floor(now.getTime() / 1000) + 12 * 3600);
    const raw = Buffer.from(cfg.publicKey, "base64url");
    const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"), y: raw.subarray(33).toString("base64url") }, format: "jwk" });
    const ok = createVerify("SHA256").update(`${h}.${b}`).verify({ key, dsaEncoding: "ieee-p1363" }, Buffer.from(s!, "base64url"));
    expect(ok).toBe(true);
    expect(Buffer.from(s!, "base64url")).toHaveLength(64);
  });
  it("never lets a token run past 24 hours", () => {
    const body = JSON.parse(Buffer.from(vapidJwt(cfg, "https://p.example", now, 999999).split(".")[1]!, "base64url").toString());
    expect(body.exp - Math.floor(now.getTime() / 1000)).toBe(24 * 3600);
  });
});

describe("pushHeaders", () => {
  const cfg = makePair();
  it("builds a body-less push for an https endpoint", () => {
    const h = pushHeaders(cfg, "https://fcm.example/send/abc", new Date())!;
    expect(h.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    expect(h["Content-Length"]).toBe("0");
    expect(h.Topic).toBe("daily-step");
    expect(h.Urgency).toBe("low");
  });
  it("refuses an endpoint that is not https", () => {
    expect(pushHeaders(cfg, "http://push.example/x")).toBeNull();
    expect(pushHeaders(cfg, "not a url")).toBeNull();
    expect(audienceOf("https://a.example:8443/p")).toBe("https://a.example:8443");
  });
});
