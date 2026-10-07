/**
 * The monthly payout run (F-103), over small interfaces so it can be tested
 * with fakes and no network. Test mode only: the route and the console
 * refuse a live key until Crent lifts that lock.
 *
 * 1. start_payout_run decides, per organisation and currency, pay, approve
 *    or skip (migration 0021: holds, verification, tax details, country,
 *    minimum, first-payout hold, placeholder rates in live mode) and writes
 *    a pending or awaiting_approval payout row.
 * 2. Every pending payout gets one Stripe transfer to the organisation's
 *    Connect account. The idempotency key is the payout id, so a retry after
 *    a crash never pays twice.
 * 3. complete_payout marks it paid and posts the payout ledger line;
 *    fail_payout records a refusal with Stripe's code.
 */

export interface PendingPayout {
  id: string;
  org_id: string;
  currency: string;
  amount_minor: number;
  stripe_destination: string | null;
}

export interface PayoutStore {
  startRun(livemode: boolean, trigger: "cron" | "staff"): Promise<string>;
  /** Every payout with status pending, optionally only one. */
  pending(livemode: boolean, onlyId?: string): Promise<PendingPayout[]>;
  complete(payoutId: string, transferId: string): Promise<void>;
  fail(payoutId: string, code: string): Promise<void>;
  finish(runId: string, outcome: Record<string, number>): Promise<void>;
}

export interface TransferApi {
  create(
    params: { amount: number; currency: string; destination: string; transfer_group: string; description: string; metadata: Record<string, string> },
    options: { idempotencyKey: string },
  ): Promise<{ id: string }>;
}

export interface PayoutOutcome {
  paid: number;
  failed: number;
  errors: number;
}

/** Stripe's error code when it has one, else a short fixed word. Never a message. */
export function stripeErrorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { code?: unknown; type?: unknown };
    if (typeof e.code === "string" && /^[a-z0-9_]{1,60}$/.test(e.code)) return e.code;
    if (typeof e.type === "string" && /^[A-Za-z]{1,60}$/.test(e.type)) return e.type;
  }
  return "transfer_failed";
}

/** Make the transfers for pending payouts. Returns counts; never throws on a Stripe refusal. */
export async function executePayouts(store: PayoutStore, transfers: TransferApi, livemode: boolean, onlyId?: string): Promise<PayoutOutcome> {
  const outcome: PayoutOutcome = { paid: 0, failed: 0, errors: 0 };
  for (const p of await store.pending(livemode, onlyId)) {
    if (!p.stripe_destination) {
      await store.fail(p.id, "no_destination");
      outcome.failed++;
      continue;
    }
    let transferId: string;
    try {
      const t = await transfers.create(
        {
          amount: p.amount_minor,
          currency: p.currency.toLowerCase(),
          destination: p.stripe_destination,
          transfer_group: `payout_${p.id}`,
          description: "Akana royalties",
          metadata: { akana_payout: p.id, akana_org: p.org_id },
        },
        { idempotencyKey: `akana-payout-${p.id}` },
      );
      transferId = t.id;
    } catch (err) {
      await store.fail(p.id, stripeErrorCode(err));
      outcome.failed++;
      continue;
    }
    try {
      await store.complete(p.id, transferId);
      outcome.paid++;
    } catch {
      // The transfer exists; the payout stays pending and the next run
      // retries with the same idempotency key, which returns this transfer.
      outcome.errors++;
    }
  }
  return outcome;
}

/** Start a run and pay it. */
export async function runPayouts(store: PayoutStore, transfers: TransferApi, livemode: boolean, trigger: "cron" | "staff") {
  const runId = await store.startRun(livemode, trigger);
  const outcome = await executePayouts(store, transfers, livemode);
  await store.finish(runId, { ...outcome });
  return { runId, ...outcome };
}

/** The day of the month in London. */
export function londonDay(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric" }).format(now));
}

export function isPayoutDay(now: Date, payoutDay: number): boolean {
  return Number.isInteger(payoutDay) && londonDay(now) === payoutDay;
}
