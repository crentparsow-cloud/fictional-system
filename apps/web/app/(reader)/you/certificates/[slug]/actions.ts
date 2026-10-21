"use server";

import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { cleanHolderName, certificateUrl } from "@/lib/certificate/certificate";
import { finishedProgrammeBySlug } from "@/lib/certificate/server";
import { newInviteToken, hashInviteToken } from "@/lib/shared-membership-token";
import { originFrom } from "@/lib/partner";
import { createUserClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function owned(slug: string) {
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/you/certificates/${slug}`)}`);
  if (!SLUG.test(slug)) redirect("/you");
  const programme = await finishedProgrammeBySlug(session.userId, slug);
  return { programme, supabase: await createUserClient() };
}

/** Make the certificate, or change the name on it. Private until the reader turns a link on. */
export async function saveCertificate(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  const { programme, supabase } = await owned(slug);
  const back = `/you/certificates/${slug}`;
  if (!programme) redirect(`${back}?notice=not-finished`);
  const name = cleanHolderName(formData.get("name"));
  if (!name.ok) redirect(`${back}?notice=bad-name`);
  const { error } = await supabase.rpc("make_certificate", { p_enrolment: programme.enrolmentId, p_name: name.name });
  if (error) {
    console.error("certificate_save_failed", error.code ?? "");
    redirect(`${back}?notice=${error.code === "55000" ? "not-finished" : "failed"}`);
  }
  redirect(`${back}?notice=saved`);
}

export interface ShareState {
  error: string | null;
  link?: string;
  off?: boolean;
}

/** Turn the public link on. The address is shown once; only its hash is kept. */
export async function turnOnCertificateLink(_prev: ShareState, formData: FormData): Promise<ShareState> {
  const slug = String(formData.get("slug") ?? "");
  const { programme, supabase } = await owned(slug);
  if (!programme) return { error: "The certificate is made once you reach the end of the programme." };
  if (programme.tier !== "none") return { error: "A certificate for this title stays private." };
  const token = newInviteToken();
  const { error } = await supabase.rpc("set_certificate_share", { p_enrolment: programme.enrolmentId, p_hash: hashInviteToken(token) });
  if (error) {
    console.error("certificate_share_failed", error.code ?? "");
    return { error: error.code === "55000" ? "A certificate for this title stays private." : "That did not work just now. Make the certificate first, then try again." };
  }
  return { error: null, link: certificateUrl(originFrom(await headers()), token) };
}

export async function turnOffCertificateLink(_prev: ShareState, formData: FormData): Promise<ShareState> {
  const slug = String(formData.get("slug") ?? "");
  const { programme, supabase } = await owned(slug);
  if (!programme) return { error: "Nothing to turn off." };
  const { error } = await supabase.rpc("set_certificate_share", { p_enrolment: programme.enrolmentId, p_hash: null });
  if (error) {
    console.error("certificate_unshare_failed", error.code ?? "");
    return { error: "That did not work just now. Try again." };
  }
  return { error: null, off: true };
}
