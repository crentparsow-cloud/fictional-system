import Link from "next/link";
import { requestMagicLink } from "@/app/(auth)/sign-in/action";
import { GoogleSignIn } from "@/components/auth/GoogleSignIn";

/**
 * The soft sign-in wall at the end of the free unit (5.2). It stands where
 * the next unit would be. It says what happens to the answers on this device,
 * offers Google first and a sign-in link second, and lets the visitor go
 * back without signing in: the answers stay on the device either way.
 *
 * It names no workbook. After sign-in the reader lands on the workbook,
 * where the answers kept here are offered to the account. Rendered on the
 * server so the Google component can load; "/try/:slug" is in ONE_TAP_PATHS.
 */
export function TryWall({ slug }: { slug: string }) {
  const next = `/read/${slug}`;
  return (
    <section className="card try-wall" aria-labelledby="try-wall-title">
      <h2 id="try-wall-title">Save your answers</h2>
      <p>Your answers are on this device only. Sign in and we will offer to keep them with your account, so you can carry on from any device.</p>
      <GoogleSignIn next={next} label="Continue with Google" divider="or" />
      <form action={requestMagicLink} noValidate className="try-wall-form">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="try-wall-email">Email address</label>
        <input id="try-wall-email" name="email" type="email" inputMode="email" autoComplete="email" spellCheck={false} required maxLength={254} />
        <button type="submit" className="btn">
          Email me a sign-in link
        </button>
      </form>
      <p className="muted small">We send one link, or a six-digit code you can type in. No password.</p>
      <p className="muted small">
        Not now? Your answers stay on this device. <Link href={`/w/${slug}`}>Back to the workbook page</Link>
      </p>
    </section>
  );
}
