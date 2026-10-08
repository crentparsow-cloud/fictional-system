import { describe, expect, it } from "vitest";
import {
  binaryToJson,
  creationOptionsFromJson,
  credentialToJson,
  fromBase64Url,
  parseCredentialJson,
  relyingParty,
  requestOptionsFromJson,
  toBase64Url,
} from "@/lib/mfa/passkey-json";

describe("passkey JSON", () => {
  it("round-trips base64url for every length", () => {
    for (let n = 0; n < 40; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
      const s = toBase64Url(bytes);
      expect(s).toBe(Buffer.from(bytes).toString("base64url"));
      expect(Array.from(fromBase64Url(s)!)).toEqual(Array.from(bytes));
    }
    expect(fromBase64Url("not base64!")).toBeNull();
    expect(fromBase64Url("a")).toBeNull();
    expect(Array.from(fromBase64Url("+/8=")!)).toEqual([251, 255]);
  });
  it("turns server options into JSON and back", () => {
    const challenge = new Uint8Array([1, 2, 3, 4]).buffer;
    const userId = new Uint8Array([9, 9]).buffer;
    const json = binaryToJson({ challenge, rp: { id: "akana.example", name: "Akana" }, user: { id: userId, name: "a@b.c" }, excludeCredentials: [{ id: new Uint8Array([7]).buffer, type: "public-key" }], timeout: undefined }) as Record<string, unknown>;
    expect(json.challenge).toBe("AQIDBA");
    expect("timeout" in json).toBe(false);
    const back = creationOptionsFromJson(json)!;
    expect(Array.from(back.challenge as Uint8Array)).toEqual([1, 2, 3, 4]);
    expect(Array.from((back.user as { id: Uint8Array }).id)).toEqual([9, 9]);
    expect(Array.from((back.excludeCredentials as { id: Uint8Array }[])[0]!.id)).toEqual([7]);
    expect(creationOptionsFromJson({ challenge: "AQID" })).toBeNull();
    const req = requestOptionsFromJson({ challenge: "AQID", allowCredentials: [{ id: "Bw", type: "public-key" }] })!;
    expect(Array.from(req.challenge as Uint8Array)).toEqual([1, 2, 3]);
    expect(requestOptionsFromJson({})).toBeNull();
  });
  it("checks the credential shape before it goes to Supabase", () => {
    const create = { id: "AQID", rawId: "AQID", type: "public-key", response: { clientDataJSON: "e30", attestationObject: "AA" } };
    const request = { id: "AQID", type: "public-key", response: { clientDataJSON: "e30", authenticatorData: "AA", signature: "AA" } };
    expect(parseCredentialJson(JSON.stringify(create), "create")).not.toBeNull();
    expect(parseCredentialJson(JSON.stringify(create), "request")).toBeNull();
    expect(parseCredentialJson(JSON.stringify(request), "request")).not.toBeNull();
    expect(parseCredentialJson(JSON.stringify({ ...create, type: "password" }), "create")).toBeNull();
    expect(parseCredentialJson("{", "create")).toBeNull();
    expect(parseCredentialJson("x".repeat(70_000), "create")).toBeNull();
    expect(parseCredentialJson(null, "create")).toBeNull();
  });
  it("serialises a browser credential with or without toJSON", () => {
    expect(credentialToJson({ toJSON: () => ({ id: "x" }) })).toEqual({ id: "x" });
    const manual = credentialToJson({
      id: "AQID",
      type: "public-key",
      response: { clientDataJSON: new Uint8Array([123, 125]).buffer, attestationObject: new Uint8Array([0]).buffer },
      getClientExtensionResults: () => ({}),
    })!;
    expect(manual.response).toEqual({ clientDataJSON: "e30", attestationObject: "AA" });
    expect(credentialToJson(null)).toBeNull();
  });
  it("names the relying party from the origin", () => {
    expect(relyingParty("https://akana.example")).toEqual({ rpId: "akana.example", rpOrigins: ["https://akana.example"] });
    expect(relyingParty("http://localhost:3000")).toEqual({ rpId: "localhost", rpOrigins: ["http://localhost:3000"] });
    expect(relyingParty("http://akana.example")).toBeNull();
    expect(relyingParty("nonsense")).toBeNull();
  });
});
