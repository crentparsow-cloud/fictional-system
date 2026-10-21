import { PushToggle } from "@/components/push/PushToggle";
import { flagEnabled } from "@/lib/platform/flags-server";
import { vapidFromEnv } from "@/lib/push/vapid";

/**
 * The You page section for the daily notification (13.19). Hidden entirely
 * while the VAPID keys are blank or the web_push flag is off for the reader.
 */
export async function PushSettings() {
  const vapid = vapidFromEnv();
  if (!vapid || !(await flagEnabled("web_push"))) return null;
  return (
    <section className="you-section" aria-labelledby="you-push">
      <h2 id="you-push">Daily notification</h2>
      <p className="muted">
        One short notification on the days and at the time you chose for reminders, for workbooks that are not about mental health. It never names a workbook. It stops by
        itself if you do not open Akana. You can turn it off at any time.
      </p>
      <PushToggle publicKey={vapid.publicKey} />
    </section>
  );
}
