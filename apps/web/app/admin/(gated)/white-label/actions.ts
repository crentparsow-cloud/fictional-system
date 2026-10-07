"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseAkCode,
  parseBrandForm,
  parseListingForm,
  whiteLabelAbilities,
  whiteLabelErrorNotice,
} from "@/lib/admin/white-label";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { validateBrand } from "@/lib/tenant-brand";

/**
 * Tenant brand and catalogue (F-067, F-069). Every write goes through the
 * user client: RLS (0001 tenants_update, 0002 tenant_listings_write) and the
 * 0023 guards decide. The brand is checked here first so staff see the
 * reason in plain words; the database checks again and is the one that
 * enforces.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function tenantIdFrom(formData: FormData): string {
  const id = formData.get("tenant_id");
  if (typeof id !== "string" || !UUID.test(id)) redirect("/admin/white-label?notice=invalid");
  return id;
}

async function editor(tenantId: string) {
  const staff = await getStaffSession(`/admin/white-label/${tenantId}`);
  if (!whiteLabelAbilities(staff.roles).editTenants) redirect(`/admin/white-label/${tenantId}?notice=denied`);
}

export async function saveTenantBrand(formData: FormData): Promise<void> {
  const tenantId = tenantIdFrom(formData);
  await editor(tenantId);
  const back = `/admin/white-label/${tenantId}`;
  const { name, brand } = parseBrandForm((k) => formData.get(k));
  const checked = validateBrand(brand);
  if (!checked.ok || !name) {
    // Only validated hex values go back in the URL, so the page can show the contrast table for them.
    const c = (brand.colours ?? null) as { light?: { primary?: string; accent?: string }; dark?: { primary?: string; accent?: string } } | null;
    const q = new URLSearchParams({ notice: "brand_invalid" });
    const put = (k: string, v: string | undefined) => {
      if (v && /^#[0-9a-f]{6}$/.test(v)) q.set(k, v.slice(1));
    };
    put("lp", c?.light?.primary);
    put("la", c?.light?.accent);
    put("dp", c?.dark?.primary);
    put("da", c?.dark?.accent);
    redirect(`${back}?${q.toString()}#brand`);
  }

  const supabase = await createUserClient();
  const { data, error } = await supabase.from("tenants").update({ name, brand: checked.brand }).eq("id", tenantId).select("id");
  if (error || !data?.length) {
    console.error("admin_tenant_brand_failed", error?.code ?? "no_row");
    redirect(`${back}?notice=${error ? whiteLabelErrorNotice(error.code) : "denied"}#brand`);
  }
  revalidatePath(back);
  redirect(`${back}?notice=brand_saved#brand`);
}

export async function saveTenantListing(formData: FormData): Promise<void> {
  const tenantId = tenantIdFrom(formData);
  await editor(tenantId);
  const back = `/admin/white-label/${tenantId}`;
  const workbookId = formData.get("workbook_id");
  const input = parseListingForm((k) => formData.get(k));
  if (typeof workbookId !== "string" || !UUID.test(workbookId) || !input) redirect(`${back}?notice=invalid#catalogue`);

  const supabase = await createUserClient();
  if (formData.get("op") === "remove") {
    const { error } = await supabase.from("tenant_listings").delete().eq("tenant_id", tenantId).eq("workbook_id", workbookId);
    if (error) redirect(`${back}?notice=${whiteLabelErrorNotice(error.code)}#catalogue`);
    revalidatePath(back);
    redirect(`${back}?notice=listing_removed#catalogue`);
  }
  const { error } = await supabase
    .from("tenant_listings")
    .update({ visible: input.visible, featured: input.featured, sort: input.sort, price_point_id: input.pricePointId })
    .eq("tenant_id", tenantId)
    .eq("workbook_id", workbookId);
  if (error) {
    console.error("admin_tenant_listing_failed", error.code ?? "");
    redirect(`${back}?notice=${whiteLabelErrorNotice(error.code)}#catalogue`);
  }
  revalidatePath(back);
  redirect(`${back}?notice=listing_saved#catalogue`);
}

export async function addTenantListing(formData: FormData): Promise<void> {
  const tenantId = tenantIdFrom(formData);
  await editor(tenantId);
  const back = `/admin/white-label/${tenantId}`;
  const code = parseAkCode(formData.get("code"));
  const input = parseListingForm((k) => formData.get(k));
  if (!code || !input) redirect(`${back}?notice=invalid#catalogue`);

  const supabase = await createUserClient();
  const { data: wb } = await supabase.from("workbooks").select("id").eq("code", code).maybeSingle();
  if (!wb) redirect(`${back}?notice=listing_unknown#catalogue`);
  const { error } = await supabase.from("tenant_listings").insert({
    tenant_id: tenantId,
    workbook_id: (wb as { id: string }).id,
    visible: true,
    featured: input.featured,
    sort: input.sort,
    price_point_id: input.pricePointId,
  });
  if (error) {
    console.error("admin_tenant_listing_add_failed", error.code ?? "");
    redirect(`${back}?notice=${whiteLabelErrorNotice(error.code)}#catalogue`);
  }
  revalidatePath(back);
  redirect(`${back}?notice=listing_added#catalogue`);
}
