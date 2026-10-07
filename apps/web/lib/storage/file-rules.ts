/**
 * Private files (F-135), the pure rules. Kept in step with the org-files
 * bucket and policies in migration 0014.
 *
 * Paths: <organisation id>/<kind>/<random uuid>.<ext>. The original file
 * name is never part of the path, so a book title in a file name does not
 * end up in a URL or a log.
 */

export const ORG_FILES_BUCKET = "org-files";
export const SIGNED_URL_SECONDS = 60;

export const FILE_KINDS = ["manuscripts", "licences"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  epub: "application/epub+zip",
} as const;
export type FileExt = keyof typeof FILE_TYPES;

export const FILE_RULES: Record<FileKind, { maxBytes: number; exts: readonly FileExt[]; label: string }> = {
  manuscripts: { maxBytes: 25 * 1024 * 1024, exts: ["pdf", "docx", "epub"], label: "PDF, Word (.docx) or EPUB, up to 25 MB" },
  licences: { maxBytes: 10 * 1024 * 1024, exts: ["pdf"], label: "PDF, up to 10 MB" },
};

export function isFileKind(v: unknown): v is FileKind {
  return typeof v === "string" && (FILE_KINDS as readonly string[]).includes(v);
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(`^(${UUID})/(manuscripts|licences)/(${UUID})\\.(pdf|docx|epub)$`);

export interface ParsedPath {
  orgId: string;
  kind: FileKind;
  ext: FileExt;
}

export function parseOrgFilePath(path: unknown): ParsedPath | null {
  if (typeof path !== "string") return null;
  const m = PATH.exec(path);
  if (!m) return null;
  const kind = m[2] as FileKind;
  const ext = m[4] as FileExt;
  if (!FILE_RULES[kind].exts.includes(ext)) return null;
  return { orgId: m[1]!, kind, ext };
}

export function buildOrgFilePath(orgId: string, kind: FileKind, ext: FileExt, id: string): string {
  return `${orgId.toLowerCase()}/${kind}/${id.toLowerCase()}.${ext}`;
}

export interface UploadRequest {
  orgId: unknown;
  kind: unknown;
  fileName: unknown;
  contentType: unknown;
  size: unknown;
}

export type UploadCheck = { ok: true; orgId: string; kind: FileKind; ext: FileExt } | { ok: false; message: string };

/** Check what the browser says about a file before any upload link is made. */
export function checkUploadRequest(r: UploadRequest): UploadCheck {
  if (typeof r.orgId !== "string" || !new RegExp(`^${UUID}$`, "i").test(r.orgId)) return { ok: false, message: "Something went wrong. Reload the page and try again." };
  if (!isFileKind(r.kind)) return { ok: false, message: "Something went wrong. Reload the page and try again." };
  const rule = FILE_RULES[r.kind];
  const name = typeof r.fileName === "string" ? r.fileName : "";
  const dot = name.lastIndexOf(".");
  const ext = (dot >= 0 ? name.slice(dot + 1) : "").toLowerCase();
  if (!(rule.exts as readonly string[]).includes(ext)) return { ok: false, message: `That file type is not accepted. Use ${rule.label}.` };
  const fileExt = ext as FileExt;
  if (typeof r.contentType === "string" && r.contentType !== "" && r.contentType !== FILE_TYPES[fileExt]) {
    return { ok: false, message: `That file type is not accepted. Use ${rule.label}.` };
  }
  const size = typeof r.size === "number" ? r.size : NaN;
  if (!Number.isFinite(size) || size <= 0) return { ok: false, message: "That file is empty." };
  if (size > rule.maxBytes) return { ok: false, message: `That file is too large. Use ${rule.label}.` };
  return { ok: true, orgId: r.orgId.toLowerCase(), kind: r.kind, ext: fileExt };
}

/**
 * Does the start of the file match its type? PDF starts with %PDF-. DOCX and
 * EPUB are zip files and start with PK\x03\x04. Checked on the server after
 * upload, from the first bytes only.
 */
export function magicMatches(ext: FileExt, head: Uint8Array): boolean {
  const starts = (sig: number[]) => sig.every((b, i) => head[i] === b);
  if (ext === "pdf") return starts([0x25, 0x50, 0x44, 0x46, 0x2d]);
  return starts([0x50, 0x4b, 0x03, 0x04]);
}
