import Link from "next/link";

/**
 * Shared pieces for the money pages (M6). The notice reads a fixed code from
 * the URL, never free text, so nothing typed is echoed back.
 */
const MESSAGES: Record<string, { tone: "ok" | "error"; text: string }> = {
  refunded: { tone: "ok", text: "Refund made in Stripe and recorded in the ledger. The author's share is reversed." },
  refunded_reclaimed: { tone: "ok", text: "Refund made. The author's share was reversed and reclaimed from their last payout." },
  refunded_no_receipt: { tone: "ok", text: "Refund made in Stripe. This payment had no ledger receipt, so nothing was reversed. Check the reconciliation." },
  refund_invalid: { tone: "error", text: "Check the form. Choose a reason, and give an amount above zero for a partial refund." },
  refund_too_much: { tone: "error", text: "That is more than is left to refund on this payment." },
  refund_no_payment: { tone: "error", text: "This payment has no Stripe payment to refund yet." },
  refund_stripe: { tone: "error", text: "Stripe refused the refund. Nothing was recorded. Try again or check Stripe." },
  refund_ledger: { tone: "error", text: "The refund went through in Stripe but the ledger did not record it. The webhook will record it when Stripe tells us." },
  reclaim_failed: { tone: "error", text: "The refund is done, but reclaiming from the payout failed. It will come off the next statement instead." },
  held: { tone: "ok", text: "Payouts held for this organisation. Any payout waiting for approval was cancelled." },
  released: { tone: "ok", text: "Hold released." },
  hold_invalid: { tone: "error", text: "Give a reason of 3 to 500 characters." },
  approved_paid: { tone: "ok", text: "Approved and paid in Stripe test mode." },
  approved_failed: { tone: "error", text: "Approved, but Stripe refused the transfer. See the payout's failure code." },
  run_done: { tone: "ok", text: "Payout run finished. See the payouts below." },
  run_live_locked: { tone: "error", text: "Payout runs work with a test-mode Stripe key only, until live payouts are agreed." },
  months_closed: { tone: "ok", text: "Due pool months and statements are closed." },
  resolved: { tone: "ok", text: "Marked resolved." },
  config_saved: { tone: "ok", text: "New figures saved. They apply to lines written from now on. Earlier lines keep their rates." },
  config_invalid: { tone: "error", text: "Check the figures. Rates are percentages from 0 to 100, days and caps are whole numbers." },
  denied: { tone: "error", text: "Your role cannot do that. Nothing changed." },
  invalid: { tone: "error", text: "That request was not valid. Nothing changed." },
  stale: { tone: "error", text: "Things changed before your action landed. Check and try again." },
  failed: { tone: "error", text: "The change did not save. Try again." },
};

export function MoneyNotice({ code }: { code: string | string[] | undefined }) {
  const key = Array.isArray(code) ? code[0] : code;
  const m = key ? MESSAGES[key] : undefined;
  if (!m) return null;
  return (
    <p className={`admin-notice admin-notice-${m.tone}`} role={m.tone === "error" ? "alert" : "status"}>
      {m.text}
    </p>
  );
}

const LINKS = [
  { href: "/admin/money", label: "Ledger" },
  { href: "/admin/money/refunds", label: "Refunds" },
  { href: "/admin/money/payouts", label: "Payouts" },
  { href: "/admin/money/statements", label: "Statements" },
];

export function MoneyNav({ current }: { current: string }) {
  return (
    <nav className="admin-filters money-nav" aria-label="Money pages">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={`admin-chip${l.href === current ? " is-active" : ""}`} aria-current={l.href === current ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export function ModeBanner({ livemode, placeholder }: { livemode: boolean; placeholder: boolean }) {
  return (
    <>
      {!livemode ? <p className="admin-note money-banner">Test mode. Every figure here comes from Stripe test payments. No real money moves.</p> : null}
      {placeholder ? (
        <p className="admin-notice admin-notice-error money-banner" role="status">
          The royalty figures are PLACEHOLDERS. Questions D1 to D5 are not answered yet, so every line and statement is provisional, and live payouts
          are refused.
        </p>
      ) : null}
    </>
  );
}
