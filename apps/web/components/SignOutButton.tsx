"use client";

import { signOut } from "@/app/(auth)/sign-out/action";
import { clearServiceWorkerCache } from "@/components/ServiceWorkerRegister";
import { deviceDrafts } from "@/lib/draft-store";

/**
 * Sign out of this device. Before the form goes, the service worker is asked
 * to drop its cache (F-140). It only ever holds the offline Help now page,
 * but a shared phone should keep nothing from this session. The same goes
 * for answers kept on the device as drafts (14.6): they are cleared here.
 * Anything not yet confirmed by the server is flushed first by the store's
 * own pagehide handler, and the sealed copy on the server is what remains.
 */
export function SignOutButton({ label, className = "btn secondary" }: { label: string; className?: string }) {
  return (
    <form action={signOut} onSubmit={() => {
        clearServiceWorkerCache();
        void deviceDrafts().clearAll();
      }}>
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
