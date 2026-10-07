import Link from "next/link";
import { LEAD_STATUS_LABELS } from "@/lib/admin/leads";

export function AdminBack({ href = "/admin", label = "Staff home" }: { href?: string; label?: string }) {
  return (
    <p className="admin-back">
      <Link href={href}>{label}</Link>
    </p>
  );
}

export function LeadStatusBadge({ status }: { status: string }) {
  const text = (LEAD_STATUS_LABELS as Record<string, string>)[status] ?? status;
  return <span className={`badge admin-status admin-status-${status}`}>{text}</span>;
}

export function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link href={href} className={`admin-chip${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
      {label}
    </Link>
  );
}

export function labelFor(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return "";
  return map[key] ?? key;
}
