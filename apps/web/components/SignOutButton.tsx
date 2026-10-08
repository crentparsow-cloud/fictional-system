"use client";

import { signOut } from "@/app/(auth)/sign-out/action";
import { clearServiceWorkerCache } from "@/components/ServiceWorkerRegister";

/**
 * Sign out of this device. Before the form goes, the service worker is asked
 * to drop its cache (F-140). It only ever holds the offline Help now page,
 * but a shared phone should keep nothing from this session.
 */
export function SignOutButton({ label, className = "btn secondary" }: { label: string; className?: string }) {
  return (
    <form action={signOut} onSubmit={() => clearServiceWorkerCache()}>
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
