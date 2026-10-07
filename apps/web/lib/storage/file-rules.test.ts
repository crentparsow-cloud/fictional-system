import { describe, expect, it } from "vitest";
import { buildOrgFilePath, checkUploadRequest, magicMatches, parseOrgFilePath } from "@/lib/storage/file-rules";

const org = "a0140000-0000-0000-0000-0000000000a1";
const id = "11111111-2222-3333-4444-555555555555";
const base = { orgId: org, kind: "manuscripts", fileName: "My Book.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1000 };

describe("upload checks", () => {
  it("accepts a manuscript and a licence PDF", () => {
    expect(checkUploadRequest(base)).toEqual({ ok: true, orgId: org, kind: "manuscripts", ext: "docx" });
    expect(checkUploadRequest({ ...base, kind: "licences", fileName: "signed.PDF", contentType: "application/pdf" }).ok).toBe(true);
  });
  it("refuses wrong types, sizes and kinds", () => {
    expect(checkUploadRequest({ ...base, kind: "licences" }).ok).toBe(false);
    expect(checkUploadRequest({ ...base, fileName: "x.exe", contentType: "" }).ok).toBe(false);
    expect(checkUploadRequest({ ...base, contentType: "application/pdf" }).ok).toBe(false);
    expect(checkUploadRequest({ ...base, size: 26 * 1024 * 1024 }).ok).toBe(false);
    expect(checkUploadRequest({ ...base, kind: "licences", fileName: "a.pdf", contentType: "application/pdf", size: 11 * 1024 * 1024 }).ok).toBe(false);
    expect(checkUploadRequest({ ...base, size: 0 }).ok).toBe(false);
    expect(checkUploadRequest({ ...base, kind: "covers" }).ok).toBe(false);
    expect(checkUploadRequest({ ...base, orgId: "../x" }).ok).toBe(false);
  });
});

describe("paths", () => {
  it("never carries the original file name and round-trips", () => {
    const p = buildOrgFilePath(org, "manuscripts", "docx", id);
    expect(p).toBe(`${org}/manuscripts/${id}.docx`);
    expect(parseOrgFilePath(p)).toEqual({ orgId: org, kind: "manuscripts", ext: "docx" });
  });
  it("rejects anything else", () => {
    expect(parseOrgFilePath(`${org}/licences/${id}.docx`)).toBeNull();
    expect(parseOrgFilePath(`${org}/manuscripts/../${id}.pdf`)).toBeNull();
    expect(parseOrgFilePath(`${org}/covers/${id}.pdf`)).toBeNull();
    expect(parseOrgFilePath(null)).toBeNull();
  });
});

describe("magic bytes", () => {
  it("knows PDF and zip files", () => {
    expect(magicMatches("pdf", new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(magicMatches("pdf", new Uint8Array([0x50, 0x4b, 3, 4]))).toBe(false);
    expect(magicMatches("docx", new Uint8Array([0x50, 0x4b, 3, 4, 0]))).toBe(true);
    expect(magicMatches("epub", new TextEncoder().encode("%PDF-"))).toBe(false);
  });
});
