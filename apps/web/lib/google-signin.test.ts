import { describe, expect, it } from "vitest";
import { googleClientId, hashNonce, looksLikeIdToken, looksLikeNonce, newNonce, postedFromThisSite } from "@/lib/google-signin";

const headersOf = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });

describe("Google One Tap", () => {
  it("renders nothing while the client id is blank", () => {
    expect(googleClientId({})).toBeNull();
    expect(googleClientId({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: "  " })).toBeNull();
    expect(googleClientId({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com" })).toBe("123.apps.googleusercontent.com");
  });
  it("mints a 64 hex nonce and hashes it the way Google expects", async () => {
    const nonce = newNonce();
    expect(looksLikeNonce(nonce)).toBe(true);
    expect(newNonce()).not.toBe(nonce);
    expect(await hashNonce("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("accepts only a JWT-shaped credential of sane length", () => {
    expect(looksLikeIdToken("eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln")).toBe(true);
    expect(looksLikeIdToken("")).toBe(false);
    expect(looksLikeIdToken("a.b")).toBe(false);
    expect(looksLikeIdToken("a.b.c d")).toBe(false);
    expect(looksLikeIdToken("a".repeat(5000) + ".b.c")).toBe(false);
    expect(looksLikeIdToken(123)).toBe(false);
  });
  it("accepts a form posted from this site only", () => {
    expect(postedFromThisSite(headersOf({ "sec-fetch-site": "same-origin" }), "akana.example")).toBe(true);
    expect(postedFromThisSite(headersOf({ "sec-fetch-site": "cross-site", origin: "https://akana.example" }), "akana.example")).toBe(false);
    expect(postedFromThisSite(headersOf({ origin: "https://akana.example" }), "akana.example")).toBe(true);
    expect(postedFromThisSite(headersOf({ origin: "https://evil.example" }), "akana.example")).toBe(false);
    expect(postedFromThisSite(headersOf({}), "akana.example")).toBe(false);
    expect(postedFromThisSite(headersOf({ origin: "null" }), "akana.example")).toBe(false);
  });
});
