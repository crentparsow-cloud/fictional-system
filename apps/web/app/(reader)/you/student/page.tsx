import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { giftDateWords } from "@/lib/gift";
import { STUDENT_NOTICES, studentEnabled, studentSuffixes } from "@/lib/student";
import { loadStudentPage } from "@/lib/student-server";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";
import { requestStudentVerification } from "./actions";
import { StudentJoin } from "./StudentJoin";

export const metadata: Metadata = { title: "Student price", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The student price (14.22). Hidden (a 404) while STRIPE_COUPON_STUDENT is
 * blank. A reader confirms an academic email address, which lasts a year, and
 * then joins the membership at 50 percent off. A month before the year ends
 * we email a reminder to confirm again; if they do not, the discount comes
 * off the subscription on the end date.
 */
export default async function StudentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!studentEnabled()) notFound();
  const session = await getReaderSession();
  if (!session) return null;
  const sp = await searchParams;
  const code = typeof sp.s === "string" ? sp.s : null;
  const notice = code && code in STUDENT_NOTICES ? STUDENT_NOTICES[code as keyof typeof STUDENT_NOTICES] : null;
  const supabase = await createUserClient();
  const data = await loadStudentPage(supabase, session.userId, await tenantIdForRequest());
  const suffixes = studentSuffixes().join(", ");
  const verified = data.status.kind === "verified";

  return (
    <section className="tab-page you-page">
      <p className="eyebrow">
        <Link href="/you#membership">You</Link>
      </p>
      <h1>Student price</h1>
      <p>
        Students get {data.percent} percent off the membership. We check with an academic email address, one that ends in {suffixes}. We check again once a year. Our{" "}
        <Link href="/help/student-price">help page</Link> has the detail.
      </p>
      {notice ? (
        <p className="you-notice" role="status">
          {notice}
        </p>
      ) : null}

      {data.status.kind === "verified" ? (
        <p role="status">Your academic email is confirmed until {giftDateWords(data.status.expiresAt)}.</p>
      ) : data.status.kind === "expired" ? (
        <p role="status">Your confirmation ran out on {giftDateWords(data.status.expiredAt)}. Confirm again to get the student price back.</p>
      ) : null}

      {verified && data.alreadyMember ? (
        <p>The student price is for a new membership. It cannot be added to one you already have.</p>
      ) : verified && data.plans.length ? (
        <StudentJoin plans={data.plans} percent={data.percent} />
      ) : null}

      {!verified || (data.status.kind === "verified" && data.status.renewSoon) ? (
        <form action={requestStudentVerification} className="card">
          <h2>{verified ? "Confirm again" : "Confirm your academic email"}</h2>
          <label htmlFor="student-email">Your academic email address</label>
          <input id="student-email" name="email" type="email" autoComplete="email" required inputMode="email" />
          <p className="small muted">We keep a scrambled copy of the address and its ending, not the address. We send one link to it. It stops working after a short time.</p>
          <button type="submit" className="btn">
            Send me the link
          </button>
        </form>
      ) : null}
    </section>
  );
}
