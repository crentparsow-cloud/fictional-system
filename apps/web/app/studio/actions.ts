"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clientIp, hashWithSalt, leadSalt } from "@/lib/leads";
import { originFrom } from "@/lib/partner";
import { parseOrgFilePath } from "@/lib/storage/file-rules";
import {
  bioClaimFlags,
  hashToken,
  httpsUrl,
  isTokenShaped,
  isUuid,
  parseIsbns,
  parseLicenceTerms,
  parseLinks,
  parseRoute,
  parseSubmissionFileKind,
  storedFileName,
  str,
  studioErrorNotice,
  withOrg,
  type StudioNotice,
} from "@/lib/studio";
import { privateFileDigest, readLicenceFile, requireStudio, sendSubmissionEmail } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Studio actions (F-033 to F-037). Each runs as the signed-in person
 * through the 0013 functions, which check the organisation role again and
 * write the audit row. Redirects carry a fixed notice code only.
 */

type Err = { code?: string; message?: string } | null;

function back(path: string, notice: StudioNotice, orgId?: string, multi = true): never {
  const p = withOrg(path, orgId, multi);
  redirect(`${p}${p.includes("?") ? "&" : "?"}notice=${notice}`);
}

function fail(path: string, error: Err, tag: string, orgId?: string): never {
  console.error(`studio_${tag}_failed`, error?.code ?? "");
  back(path, studioErrorNotice(error?.code, error?.message), orgId);
}

// ---------------------------------------------------------------------------
// Invitation (F-033)
// ---------------------------------------------------------------------------

export async function acceptInvite(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!isTokenShaped(token)) redirect("/studio");
  const supabase = await createUserClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect(`/sign-in?next=${encodeURIComponent(`/studio/join/${token}`)}`);
  const { data, error } = await supabase.rpc("org_invite_accept", { p_token_hash: await hashToken(token) });
  if (error) {
    const reason = error.code === "AKS03" ? "other-address" : error.code === "AKS04" ? "closed" : "failed";
    console.error("studio_accept_failed", error.code ?? "");
    redirect(`/studio/join/${token}?e=${reason}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { org_id?: string } | null;
  revalidatePath("/studio");
  redirect(row?.org_id ? `/studio?org=${row.org_id}&welcome=1` : "/studio");
}

// ---------------------------------------------------------------------------
// Profile and bio (F-034)
// ---------------------------------------------------------------------------

export async function saveProfile(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/studio/profile", String(formData.get("org") ?? ""));
  const author = String(formData.get("author") ?? "");
  const links = parseLinks(formData.get("links"));
  const websiteRaw = str(formData.get("website"), 300);
  const website = websiteRaw ? httpsUrl(websiteRaw) : null;
  if (links === null || (websiteRaw && !website)) back("/studio/profile", "invalid", ctx.org.id, ctx.multi);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("author_save", {
    p_org: ctx.org.id,
    p_author: isUuid(author) ? author : null,
    p_display_name: str(formData.get("display_name"), 120),
    p_legal_name: str(formData.get("legal_name"), 200) || null,
    p_country: str(formData.get("country"), 2).toUpperCase(),
    p_website: website,
    p_links: links,
    p_spelling: formData.get("spelling") === "en-US" ? "en-US" : "en-GB",
    p_photo_rights: formData.get("photo_rights") === "yes",
    p_link_self: true,
  });
  if (error) fail("/studio/profile", error, "profile", ctx.org.id);
  revalidatePath("/studio/profile");
  back("/studio/profile", "saved", ctx.org.id, ctx.multi);
}

export async function submitBio(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/studio/profile", String(formData.get("org") ?? ""));
  const author = String(formData.get("author") ?? "");
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 1200);
  if (!isUuid(author) || !bio || /[<>]/.test(bio)) back("/studio/profile", "invalid", ctx.org.id, ctx.multi);
  const flags = bioClaimFlags(bio);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("author_bio_submit", {
    p_author: author,
    p_bio: bio,
    p_flags: flags.map((phrase) => ({ phrase })),
  });
  if (error) fail("/studio/profile", error, "bio", ctx.org.id);
  revalidatePath("/studio/profile");
  back("/studio/profile", flags.length ? "bio-flagged" : "bio-sent", ctx.org.id, ctx.multi);
}

// ---------------------------------------------------------------------------
// Books and contributors (F-035)
// ---------------------------------------------------------------------------

export async function saveBook(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/studio/books", String(formData.get("org") ?? ""));
  const bookId = String(formData.get("book") ?? "");
  const home = isUuid(bookId) ? `/studio/books/${bookId}` : "/studio/books";
  const isbns = parseIsbns(formData.get("isbns"));
  if (isbns === null) back(home, "isbn-invalid", ctx.org.id, ctx.multi);
  const storeRaw = str(formData.get("store_link"), 500);
  const store = storeRaw ? httpsUrl(storeRaw, 500) : null;
  if (storeRaw && !store) back(home, "invalid", ctx.org.id, ctx.multi);
  const year = str(formData.get("year"), 4);
  const seriesNo = str(formData.get("series_number"), 6);
  const imprint = String(formData.get("imprint") ?? "");
  const kdp = String(formData.get("kdp_select") ?? "");

  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("book_save", {
    p_org: ctx.org.id,
    p_book: isUuid(bookId) ? bookId : null,
    p_title: str(formData.get("title"), 300),
    p_subtitle: str(formData.get("subtitle"), 300) || null,
    p_series: str(formData.get("series"), 200) || null,
    p_series_number: seriesNo && Number.isFinite(Number(seriesNo)) ? Number(seriesNo) : null,
    p_edition: str(formData.get("edition"), 100) || null,
    p_language: str(formData.get("language"), 5) || "en",
    p_isbns: isbns,
    p_asin: str(formData.get("asin"), 10) || null,
    p_publisher: str(formData.get("publisher"), 200) || null,
    p_imprint: isUuid(imprint) ? imprint : null,
    p_year: /^\d{4}$/.test(year) ? Number(year) : null,
    p_genre: str(formData.get("genre"), 40) || null,
    p_rights_status: String(formData.get("rights_status") ?? "licensed"),
    p_store_link: store,
    p_cover_rights: formData.get("cover_rights") === "yes",
    p_kdp_select: kdp === "yes" || kdp === "no" ? kdp : null,
  });
  if (error) fail(home, error, "book", ctx.org.id);
  const id = String(data ?? "");
  revalidatePath("/studio/books");
  back(isUuid(id) ? `/studio/books/${id}` : "/studio/books", isUuid(bookId) ? "saved" : "book-created", ctx.org.id, ctx.multi);
}

export async function setContributor(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/studio/books", String(formData.get("org") ?? ""));
  const bookId = String(formData.get("book") ?? "");
  if (!isUuid(bookId)) back("/studio/books", "invalid", ctx.org.id, ctx.multi);
  const home = `/studio/books/${bookId}`;
  const role = String(formData.get("role") ?? "author");
  const remove = formData.get("remove") === "yes";
  const supabase = await createUserClient();

  let authorId = String(formData.get("author") ?? "");
  const newName = str(formData.get("new_name"), 120);
  if (!remove && !isUuid(authorId) && newName) {
    // Someone not yet on the roster: add them without a login.
    const { data, error } = await supabase.rpc("author_save", {
      p_org: ctx.org.id,
      p_author: null,
      p_display_name: newName,
      p_legal_name: null,
      p_country: "",
      p_website: null,
      p_links: [],
      p_spelling: "en-GB",
      p_photo_rights: false,
      p_link_self: false,
    });
    if (error) fail(home, error, "roster_add", ctx.org.id);
    authorId = String(data ?? "");
  }
  if (!isUuid(authorId)) back(home, "invalid", ctx.org.id, ctx.multi);
  const death = str(formData.get("death_year"), 4);
  const { error } = await supabase.rpc("book_contributor_set", {
    p_book: bookId,
    p_author: authorId,
    p_role: role,
    p_death_year: /^\d{1,4}$/.test(death) ? Number(death) : null,
    p_sort: 0,
    p_remove: remove,
  });
  if (error) fail(home, error, "contributor", ctx.org.id);
  revalidatePath(home);
  back(home, "saved", ctx.org.id, ctx.multi);
}

// ---------------------------------------------------------------------------
// Licence (F-036)
// ---------------------------------------------------------------------------

async function ipHash(): Promise<string | null> {
  try {
    return hashWithSalt(clientIp(await headers()), leadSalt());
  } catch {
    return null;
  }
}

export async function acceptLicence(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/studio/books", String(formData.get("org") ?? ""));
  const bookId = String(formData.get("book") ?? "");
  if (!isUuid(bookId)) back("/studio/books", "invalid", ctx.org.id, ctx.multi);
  const home = `/studio/books/${bookId}/licence`;
  const file = readLicenceFile();
  if (!file || formData.get("sha") !== file.sha256 || formData.get("version") !== file.version) back(home, "licence-changed", ctx.org.id, ctx.multi);
  if (!["warrant_rights", "warrant_no_clash", "warrant_no_claims"].every((k) => formData.get(k) === "yes")) {
    back(home, "licence-warranties", ctx.org.id, ctx.multi);
  }
  const parsed = parseLicenceTerms((k) => formData.get(k));
  if (!parsed.ok) back(home, "invalid", ctx.org.id, ctx.multi);
  const t = parsed.terms;
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("licence_accept", {
    p_book: bookId,
    p_version: file.version,
    p_text_sha256: file.sha256,
    p_territories: t.territories,
    p_excluded: t.excluded,
    p_term_months: t.termMonths,
    p_exclusive_months: t.exclusiveMonths,
    p_subscription: t.subscription,
    p_cover: t.cover,
    p_audio: t.audio,
    p_warrant_rights: true,
    p_warrant_no_clash: true,
    p_warrant_no_claims: true,
    p_signer_name: t.signerName,
    p_signer_capacity: t.signerCapacity,
    p_ip_hash: await ipHash(),
  });
  if (error) fail(home, error, "licence", ctx.org.id);
  const row = (Array.isArray(data) ? data[0] : data) as { licence_status?: string } | null;
  revalidatePath(`/studio/books/${bookId}`);
  back(`/studio/books/${bookId}`, row?.licence_status === "active" ? "licence-signed" : "licence-test", ctx.org.id, ctx.multi);
}

export async function uploadLicence(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/studio/books", String(formData.get("org") ?? ""));
  const bookId = String(formData.get("book") ?? "");
  if (!isUuid(bookId)) back("/studio/books", "invalid", ctx.org.id, ctx.multi);
  const home = `/studio/books/${bookId}/licence`;
  const file = readLicenceFile();
  if (!file) back(home, "failed", ctx.org.id, ctx.multi);
  const path = String(formData.get("licence_path") ?? "");
  const parsedPath = parseOrgFilePath(path);
  if (!parsedPath || parsedPath.kind !== "licences" || parsedPath.orgId !== ctx.org.id) back(home, "file-missing", ctx.org.id, ctx.multi);
  const parsed = parseLicenceTerms((k) => formData.get(k));
  if (!parsed.ok) back(home, "invalid", ctx.org.id, ctx.multi);
  const digest = await privateFileDigest(path);
  if (!digest) back(home, "file-missing", ctx.org.id, ctx.multi);
  const t = parsed.terms;
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("licence_upload", {
    p_book: bookId,
    p_version: file.version,
    p_path: path,
    p_document_sha256: digest.sha256,
    p_territories: t.territories,
    p_excluded: t.excluded,
    p_term_months: t.termMonths,
    p_exclusive_months: t.exclusiveMonths,
    p_subscription: t.subscription,
    p_cover: t.cover,
    p_audio: t.audio,
    p_signer_name: t.signerName,
    p_signer_capacity: t.signerCapacity,
    p_ip_hash: await ipHash(),
  });
  if (error) fail(home, error, "licence_upload", ctx.org.id);
  revalidatePath(`/studio/books/${bookId}`);
  back(`/studio/books/${bookId}`, "licence-uploaded", ctx.org.id, ctx.multi);
}

// ---------------------------------------------------------------------------
// Submissions (F-037)
// ---------------------------------------------------------------------------

async function attachFile(submissionId: string, orgId: string, path: string, kindRaw: unknown): Promise<Err> {
  const parsed = parseOrgFilePath(path);
  const kind = parseSubmissionFileKind(kindRaw) ?? "manuscript";
  if (!parsed || parsed.kind !== "manuscripts" || parsed.orgId !== orgId) return { code: "AKS02" };
  const digest = await privateFileDigest(path);
  if (!digest) return { code: "AKS02" };
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("submission_add_file", {
    p_submission: submissionId,
    p_kind: kind,
    p_path: path,
    p_file_name: storedFileName(kind, parsed.ext),
    p_mime: { pdf: "application/pdf", epub: "application/epub+zip", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }[parsed.ext],
    p_size: digest.size,
    p_sha256: digest.sha256,
  });
  return error;
}

export async function createSubmission(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/studio/books", String(formData.get("org") ?? ""));
  const bookId = String(formData.get("book") ?? "");
  if (!isUuid(bookId)) back("/studio/books", "invalid", ctx.org.id, ctx.multi);
  const home = `/studio/books/${bookId}/submit`;
  const route = parseRoute(formData.get("route"));
  const brief = String(formData.get("brief") ?? "").trim().slice(0, 4000);
  const filePath = String(formData.get("file_path") ?? "");
  if (!route || !brief) back(home, "invalid", ctx.org.id, ctx.multi);
  if (route === "upload" && !filePath) back(home, "file-missing", ctx.org.id, ctx.multi);

  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("submission_create", {
    p_book: bookId,
    p_route: route,
    p_title: str(formData.get("title"), 200) || null,
    p_genre: str(formData.get("genre"), 40),
    p_brief: brief,
  });
  if (error) fail(home, error, "submission", ctx.org.id);
  const row = (Array.isArray(data) ? data[0] : data) as { submission_id?: string; workbook_id?: string } | null;
  const submissionId = row?.submission_id ?? "";

  let notice: StudioNotice = "submitted";
  if (filePath && isUuid(submissionId)) {
    const fileErr = await attachFile(submissionId, ctx.org.id, filePath, formData.get("file_kind"));
    if (fileErr) {
      console.error("studio_submission_file_failed", fileErr.code ?? "");
      notice = "file-missing";
    }
  }

  // The submission email may name the workbook: it goes to the person who submitted it.
  if (ctx.email && isUuid(submissionId)) {
    const { data: wb } = await supabase.from("workbooks").select("title").eq("id", row?.workbook_id ?? "").maybeSingle();
    try {
      await sendSubmissionEmail({
        origin: originFrom(await headers()),
        to: ctx.email,
        workbookTitle: (wb?.title as string | undefined) ?? "Your workbook",
        submissionId,
      });
    } catch (e) {
      console.error("studio_submission_mail_failed", e instanceof Error ? e.name : "unknown");
    }
  }
  revalidatePath(`/studio/books/${bookId}`);
  back(`/studio/books/${bookId}`, notice, ctx.org.id, ctx.multi);
}

export async function addSubmissionFile(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/studio/books", String(formData.get("org") ?? ""));
  const bookId = String(formData.get("book") ?? "");
  const submissionId = String(formData.get("submission") ?? "");
  if (!isUuid(bookId) || !isUuid(submissionId)) back("/studio/books", "invalid", ctx.org.id, ctx.multi);
  const home = `/studio/books/${bookId}`;
  const path = String(formData.get("file_path") ?? "");
  if (!path) back(home, "file-missing", ctx.org.id, ctx.multi);
  const error = await attachFile(submissionId, ctx.org.id, path, formData.get("file_kind"));
  if (error) fail(home, error, "submission_file", ctx.org.id);
  revalidatePath(home);
  back(home, "file-added", ctx.org.id, ctx.multi);
}

export async function withdrawSubmission(formData: FormData): Promise<void> {
  const ctx = await requireStudio("/studio/books", String(formData.get("org") ?? ""));
  const bookId = String(formData.get("book") ?? "");
  const submissionId = String(formData.get("submission") ?? "");
  if (!isUuid(bookId) || !isUuid(submissionId)) back("/studio/books", "invalid", ctx.org.id, ctx.multi);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("submission_withdraw", { p_submission: submissionId });
  if (error) fail(`/studio/books/${bookId}`, error, "withdraw", ctx.org.id);
  revalidatePath(`/studio/books/${bookId}`);
  back(`/studio/books/${bookId}`, "withdrawn", ctx.org.id, ctx.multi);
}
