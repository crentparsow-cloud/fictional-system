import type { Metadata } from "next";
import { KitClient } from "@/components/kit/KitClient";
import { requireKitPage } from "@/lib/design/kit-gate";

export const metadata: Metadata = { title: "Component kit", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Component library (plan 1.7). Every shared component in every state, light
 * and dark, in the active design direction, with a switcher that previews the
 * other two by swapping the token file in the browser. Developers and staff
 * only: see lib/design/kit-gate.ts.
 */
export default async function KitPage() {
  await requireKitPage();
  return <KitClient />;
}
