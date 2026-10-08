import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminBack } from "../../_components/Bits";
import { Notice } from "../../_components/Notice";
import { addTenantListing, saveTenantBrand, saveTenantListing } from "../actions";
import { DomainsSection } from "./DomainsSection";
import { checkedColours, linksToText, LISTING_PRICE_OPTIONS, whiteLabelAbilities } from "@/lib/admin/white-label";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { BRAND_FONTS, contrastChecks, formatRatio, validateBrand, type BrandColours, type ThemeName } from "@/lib/tenant-brand";

export const metadata: Metadata = { title: "White-label site", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HOUSE: Record<ThemeName, BrandColours> = {
  light: { primary: "#1f4e5a", accent: "#1f4e5a" },
  dark: { primary: "#7fc2cf", accent: "#173c45" },
};

type Listing = {
  workbook_id: string;
  visible: boolean;
  sort: number;
  featured: boolean;
  price_point_id: string | null;
  workbooks: { code: string; title: string; status: string; is_demo: boolean } | null;
};

/**
 * One tenant's brand and catalogue (F-067, F-069). The contrast table shows
 * every check the database runs, for the stored colours or for the colours
 * just checked. Colours below 4.5 to 1 cannot be saved.
 */
export default async function TenantAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const staff = await getStaffSession(`/admin/white-label/${id}`);
  const can = whiteLabelAbilities(staff.roles);
  const sp = await searchParams;
  const supabase = await createUserClient();

  const [{ data: t }, { data: listingData }] = await Promise.all([
    supabase.from("tenants").select("id, slug, kind, name, brand, status, is_demo").eq("id", id).maybeSingle(),
    supabase
      .from("tenant_listings")
      .select("workbook_id, visible, sort, featured, price_point_id, workbooks(code, title, status, is_demo)")
      .eq("tenant_id", id)
      .order("featured", { ascending: false })
      .order("sort")
      .limit(300),
  ]);
  const tenant = t as { id: string; slug: string; kind: string; name: string; brand: unknown; status: string; is_demo: boolean } | null;
  if (!tenant || tenant.kind !== "white_label") notFound();
  const listings = (listingData ?? []) as unknown as Listing[];

  const stored = validateBrand(tenant.brand);
  const brand = stored.ok ? stored.brand : {};
  const fromQuery = checkedColours(sp);
  const colours = fromQuery ?? brand.colours ?? HOUSE;
  const checks = contrastChecks(colours);
  const disabled = !can.editTenants;

  return (
    <div>
      <AdminBack href="/admin/white-label" label="White-label sites" />
      <h1>
        {tenant.name} {tenant.is_demo ? <span className="badge demo">Demo</span> : null}
      </h1>
      <p className="muted">
        Slug {tenant.slug}. Status {tenant.status}.
      </p>
      <Notice code={sp.notice} />

      <section id="brand" aria-labelledby="brand-h">
        <h2 id="brand-h">Brand</h2>
        <p>
          A tenant sets its name, logo, favicon, two colours for each theme, a heading font, footer links, extra legal links and the email sender
          name. It cannot hide or restyle Help now, the wellness notice, safety copy or the privacy pages, and it cannot add scripts or CSS.
        </p>

        <h3>Contrast</h3>
        <p className="muted small">{fromQuery ? "For the colours you just tried." : brand.colours ? "For the saved colours." : "For the house colours."} Every check needs 4.5 to 1.</p>
        <div className="admin-table-wrap">
          <table className="admin-table contrast-table">
            <thead>
              <tr>
                <th scope="col">Theme</th>
                <th scope="col">Check</th>
                <th scope="col">Text on background</th>
                <th scope="col">Ratio</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={`${c.theme}-${c.id}`}>
                  <td>{c.theme === "light" ? "Light" : "Dark"}</td>
                  <td>{c.label}</td>
                  <td>
                    {c.foreground} on {c.background}
                  </td>
                  <td className={c.pass ? "pass" : "fail"}>
                    {formatRatio(c.ratio)} to 1 {c.pass ? "Passes" : "Too low"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form action={saveTenantBrand} className="admin-form">
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <label htmlFor="b-name">Site name</label>
          <input id="b-name" name="name" defaultValue={tenant.name} required maxLength={80} disabled={disabled} />
          <fieldset>
            <legend>Light theme</legend>
            <label htmlFor="b-lp">Main colour (links and buttons)</label>
            <input id="b-lp" name="light_primary" type="color" defaultValue={colours.light.primary} disabled={disabled} />
            <label htmlFor="b-la">Second colour (header band)</label>
            <input id="b-la" name="light_accent" type="color" defaultValue={colours.light.accent} disabled={disabled} />
          </fieldset>
          <fieldset>
            <legend>Dark theme</legend>
            <label htmlFor="b-dp">Main colour (links and buttons)</label>
            <input id="b-dp" name="dark_primary" type="color" defaultValue={colours.dark.primary} disabled={disabled} />
            <label htmlFor="b-da">Second colour (header band)</label>
            <input id="b-da" name="dark_accent" type="color" defaultValue={colours.dark.accent} disabled={disabled} />
          </fieldset>
          <label htmlFor="b-font">Heading font</label>
          <select id="b-font" name="font" defaultValue={brand.font ?? "house"} disabled={disabled}>
            {Object.entries(BRAND_FONTS).map(([k, f]) => (
              <option key={k} value={k}>
                {f.label}
              </option>
            ))}
          </select>
          <label htmlFor="b-logo">Logo file</label>
          <input id="b-logo" name="logo_src" defaultValue={brand.logo?.src ?? ""} placeholder="/brand/<slug>/logo.svg" disabled={disabled} />
          <label htmlFor="b-alt">Logo alt text</label>
          <input id="b-alt" name="logo_alt" defaultValue={brand.logo?.alt ?? ""} maxLength={120} disabled={disabled} />
          <label htmlFor="b-fav">Favicon file</label>
          <input id="b-fav" name="favicon" defaultValue={brand.favicon ?? ""} disabled={disabled} />
          <label htmlFor="b-footer">Footer links, one per line as Label | https://address (up to 5)</label>
          <textarea id="b-footer" name="footer_links" rows={3} defaultValue={linksToText(brand.footer_links)} disabled={disabled} />
          <label htmlFor="b-legal">Extra legal links, shown beside Akana&apos;s (up to 4)</label>
          <textarea id="b-legal" name="legal_links" rows={2} defaultValue={linksToText(brand.legal_links)} disabled={disabled} />
          <label htmlFor="b-sender">Email sender name</label>
          <input id="b-sender" name="sender_name" defaultValue={brand.sender_name ?? ""} maxLength={60} disabled={disabled} />
          <button type="submit" className="btn" disabled={disabled}>
            Check and save brand
          </button>
        </form>
      </section>

      <section id="catalogue" aria-labelledby="cat-h">
        <h2 id="cat-h">Catalogue and prices</h2>
        <p>
          The site shows visible listings of live workbooks, featured first, then by order. A tenant may list its own organisation&apos;s workbooks;
          a demo site lists demo workbooks only. The price is a point on the ladder and is a setting only: there is no checkout on tenant sites
          yet.
        </p>
        {listings.length === 0 ? <p className="muted">Nothing listed yet.</p> : null}
        {listings.map((l) => (
          <form key={l.workbook_id} action={saveTenantListing} className="admin-form admin-inline-form">
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <input type="hidden" name="workbook_id" value={l.workbook_id} />
            <p>
              <strong>{l.workbooks?.code}</strong> {l.workbooks?.title}{" "}
              {l.workbooks?.is_demo ? <span className="badge demo">Demo</span> : null}{" "}
              <span className="muted small">({l.workbooks?.status}; only live titles show)</span>
            </p>
            <label>
              <input type="checkbox" name="visible" defaultChecked={l.visible} disabled={disabled} /> Visible
            </label>
            <label>
              <input type="checkbox" name="featured" defaultChecked={l.featured} disabled={disabled} /> Featured
            </label>
            <label htmlFor={`sort-${l.workbook_id}`}>Order</label>
            <input id={`sort-${l.workbook_id}`} name="sort" type="number" min={-999} max={9999} defaultValue={l.sort} disabled={disabled} />
            <label htmlFor={`price-${l.workbook_id}`}>Price point</label>
            <select id={`price-${l.workbook_id}`} name="price_point_id" defaultValue={l.price_point_id ?? ""} disabled={disabled}>
              <option value="">The workbook&apos;s own</option>
              {LISTING_PRICE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <div className="wb-actions">
              <button type="submit" className="btn secondary" name="op" value="save" disabled={disabled}>
                Save
              </button>
              <button type="submit" className="btn secondary" name="op" value="remove" disabled={disabled}>
                Remove from site
              </button>
            </div>
          </form>
        ))}

        <h3>Add a workbook</h3>
        <form action={addTenantListing} className="admin-form">
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <label htmlFor="add-code">AK code</label>
          <input id="add-code" name="code" required pattern="[Aa][Kk]-[0-9A-Za-z]{5}" placeholder="AK-XXXXX" disabled={disabled} />
          <label htmlFor="add-sort">Order</label>
          <input id="add-sort" name="sort" type="number" defaultValue={listings.length} disabled={disabled} />
          <label>
            <input type="checkbox" name="featured" disabled={disabled} /> Featured
          </label>
          <label htmlFor="add-price">Price point</label>
          <select id="add-price" name="price_point_id" defaultValue="" disabled={disabled}>
            <option value="">The workbook&apos;s own</option>
            {LISTING_PRICE_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button type="submit" className="btn" disabled={disabled}>
            Add to site
          </button>
        </form>
      </section>

      {tenant.is_demo ? null : <DomainsSection tenantId={tenant.id} disabled={disabled} />}

      <p>
        <Link href="/admin/demo">Demo publisher and logins</Link>
      </p>
    </div>
  );
}
