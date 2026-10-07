import type { Metadata } from "next";
import { StudioShell } from "@/components/studio/StudioShell";

export const metadata: Metadata = {
  title: { default: "Team", template: "%s | Akana console" },
  robots: { index: false, follow: false },
};

/** Organisation console (F-055, F-056). Apex host only (proxy). */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <StudioShell>{children}</StudioShell>;
}
