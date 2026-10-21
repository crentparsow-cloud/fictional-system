"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { bytesToBase64Url, pushSupport, urlBase64ToBytes, type PushSupport } from "@/lib/push/client";
import { removePushSubscription, savePushSubscription } from "./actions";

/**
 * Daily step notification for this device (13.19). Asking for permission
 * happens only when the reader presses the button. The notification says one
 * fixed line and never names a workbook; it comes on the days and at the time
 * chosen for reminders, and stops by itself if nothing is opened.
 */
function deviceSupport(): PushSupport {
  const installed = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return pushSupport({
    hasServiceWorker: "serviceWorker" in navigator,
    hasPush: "PushManager" in window,
    hasNotification: "Notification" in window,
    installed: Boolean(installed),
    isApple,
  });
}

export function PushToggle({ publicKey }: { publicKey: string }) {
  const support = useSyncExternalStore<PushSupport | "checking">(() => () => undefined, deviceSupport, () => "checking");
  const [on, setOn] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (support !== "ready") return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setOn(Boolean(sub) && Notification.permission === "granted"))
      .catch(() => undefined);
  }, [support]);

  if (support === "checking") return null;
  if (support === "unsupported") return <p className="muted">This browser cannot show notifications.</p>;
  if (support === "needs_install") return <p className="muted">Add Akana to your home screen first. Then you can ask for a daily notification here.</p>;

  function turnOn() {
    setNote(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setNote("Notifications are blocked for this site. Change that in your browser settings if you change your mind.");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(publicKey) as BufferSource }));
        const result = await savePushSubscription({ endpoint: sub.endpoint, p256dh: bytesToBase64Url(sub.getKey("p256dh")), auth: bytesToBase64Url(sub.getKey("auth")) });
        if (!result.ok) {
          await sub.unsubscribe().catch(() => undefined);
          setNote(result.message);
          return;
        }
        setOn(true);
      } catch {
        setNote("Could not turn notifications on. Try again in a moment.");
      }
    });
  }

  function turnOff() {
    setNote(null);
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await removePushSubscription(sub.endpoint);
          await sub.unsubscribe();
        }
        setOn(false);
      } catch {
        setNote("Could not turn notifications off. Try again in a moment.");
      }
    });
  }

  return (
    <div className="push-toggle">
      {on ? (
        <button type="button" className="btn secondary" onClick={turnOff} disabled={pending}>
          Turn off on this device
        </button>
      ) : (
        <button type="button" className="btn secondary" onClick={turnOn} disabled={pending}>
          Turn on for this device
        </button>
      )}
      {note ? (
        <p className="muted" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
