import type { Metadata } from "next";
import { RoleMfaBanner } from "@/components/mfa/RoleMfaBanner";
import { OrgShell } from "@/components/org/OrgShell";

export const metadata: Metadata = {
  title: { default: "Seats", template: "%s | Akana for organisations" },
  robots: { index: false, follow: false },
};

/** Akana for organisations (F-203, F-204). Apex host only (proxy). */
export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return (
    <OrgShell>
      <RoleMfaBanner next="/org" />
      {children}
    </OrgShell>
  );
}
