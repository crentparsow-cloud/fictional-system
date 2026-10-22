import type { Metadata } from "next";
import Link from "next/link";
import { STUDENT_VERIFY_RESULT_WORDS } from "@/lib/student";
import { confirmStudentEmail } from "./actions";

/**
 * The student link (14.22), opened from the email. The reader layout sends a
 * signed-out visitor to sign in and back here. Opening the page does not
 * confirm anything: the button does.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm your student email", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function StudentVerifyPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const r = typeof sp.r === "string" ? sp.r : null;
  const words = r && r in STUDENT_VERIFY_RESULT_WORDS ? STUDENT_VERIFY_RESULT_WORDS[r as keyof typeof STUDENT_VERIFY_RESULT_WORDS] : null;
  return (
    <section className="tab-page you-page">
      <h1>Confirm your student email</h1>
      {words ? (
        <>
          <p role="status">{words}</p>
          <p>
            <Link className="btn" href="/you/student">
              Go to the student price
            </Link>
          </p>
        </>
      ) : (
        <>
          <p>Press the button to confirm the academic address you gave us. Do this while you are signed in to the account you asked from.</p>
          <form action={confirmStudentEmail}>
            <input type="hidden" name="t" value={token} />
            <button type="submit" className="btn">
              Confirm my email
            </button>
          </form>
        </>
      )}
    </section>
  );
}
