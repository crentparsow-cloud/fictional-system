import { ReaderTopBar } from "@/components/reader/ReaderTopBar";

/** Sign-in, welcome and terms sit outside the public header, so they get the slim bar. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="c-auth-shell">
      <ReaderTopBar link={{ href: "/library", label: "Try week 1 free" }} />
      {children}
    </div>
  );
}
