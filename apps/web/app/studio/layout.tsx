import type { Metadata } from "next";
import { RoleMfaBanner } from "@/components/mfa/RoleMfaBanner";
import { StudioShell } from "@/components/studio/StudioShell";

export const metadata: Metadata = {
  title: { default: "Studio", template: "%s | Akana Studio" },
  robots: { index: false, follow: false },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudioShell>
      <RoleMfaBanner next="/studio" />
      {children}
    </StudioShell>
  );
}
