import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import {
  ORG_FILES_BUCKET,
  SIGNED_URL_SECONDS,
  buildOrgFilePath,
  checkUploadRequest,
  magicMatches,
  parseOrgFilePath,
  type UploadRequest,
} from "@/lib/storage/file-rules";

/**
 * Private files for manuscripts and signed licences (F-135).
 *
 * Every Storage call runs with the user's own client, so the org-files
 * policies in migration 0014 decide: only the owning organisation (with the
 * right role) and Akana staff. Uploads go straight from the browser to
 * Storage on a signed upload URL, which Storage only signs when the insert
 * policy allows it, so large files never pass through a Vercel function.
 * Downloads are signed URLs that last 60 seconds, made only when the read
 * policy allows it, and each one writes an audit row.
 *
 * The bucket enforces the size cap (25 MB) and the content types. After an
 * upload the server reads the first bytes and removes a file whose content
 * does not match its type.
 */

export type UploadTicket = { ok: true; path: string; signedUrl: string; token: string } | { ok: false; message: string };

export async function requestPrivateUpload(r: UploadRequest): Promise<UploadTicket> {
  const check = checkUploadRequest(r);
  if (!check.ok) return check;
  const path = buildOrgFilePath(check.orgId, check.kind, check.ext, crypto.randomUUID());
  const supabase = await createUserClient();
  const { data, error } = await supabase.storage.from(ORG_FILES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.warn("private_upload_refused", { kind: check.kind });
    return { ok: false, message: "You cannot upload files for this organisation, or you have uploaded a lot in the last hour. Try again later." };
  }
  return { ok: true, path: data.path ?? path, signedUrl: data.signedUrl, token: data.token };
}

export type UploadConfirm = { ok: true; path: string } | { ok: false; message: string };

/** After the browser's upload: check the first bytes match the type, then record it. */
export async function confirmPrivateUpload(path: unknown): Promise<UploadConfirm> {
  const parsed = parseOrgFilePath(path);
  if (!parsed) return { ok: false, message: "Something went wrong. Try the upload again." };
  const p = path as string;
  const supabase = await createUserClient();
  const { data: signed, error } = await supabase.storage.from(ORG_FILES_BUCKET).createSignedUrl(p, SIGNED_URL_SECONDS);
  if (error || !signed) return { ok: false, message: "We could not find that upload. Try again." };

  let head = new Uint8Array();
  try {
    const res = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-7" }, cache: "no-store" });
    head = new Uint8Array(await res.arrayBuffer()).slice(0, 8);
  } catch {
    return { ok: false, message: "We could not check that upload. Try again." };
  }
  if (!magicMatches(parsed.ext, head)) {
    const { error: rmErr } = await createAdminClient().storage.from(ORG_FILES_BUCKET).remove([p]);
    if (rmErr) console.error("private_upload_remove_failed", { kind: parsed.kind });
    return { ok: false, message: "That file does not look like the type its name says. Save it again as a PDF, Word or EPUB file and retry." };
  }

  const { error: auditErr } = await supabase.rpc("note_private_file", { p_name: p, p_action: "uploaded" });
  if (auditErr) console.error("private_upload_audit_failed", auditErr.code ?? "");
  return { ok: true, path: p };
}

/**
 * A download link that lasts 60 seconds, or null when the caller may not
 * read the file. Fails closed: no audit row, no link.
 */
export async function signedDownloadUrl(path: unknown): Promise<string | null> {
  const parsed = parseOrgFilePath(path);
  if (!parsed) return null;
  const p = path as string;
  const supabase = await createUserClient();
  const { error: auditErr } = await supabase.rpc("note_private_file", { p_name: p, p_action: "download_link" });
  if (auditErr) return null;
  const { data, error } = await supabase.storage.from(ORG_FILES_BUCKET).createSignedUrl(p, SIGNED_URL_SECONDS, { download: true });
  if (error || !data) return null;
  return data.signedUrl;
}
