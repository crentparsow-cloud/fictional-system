# White-label demo and demo logins (M7)

Features F-067, F-068, F-069, F-074 and F-045. Migration `supabase/migrations/0023_whitelabel_demo.sql`, tests in `supabase/tests/0023_whitelabel_demo.sql`.

## 1. What a tenant site is

A white-label host serves two things and nothing else.

- The tenant site: `/` (the tenant's catalogue) and `/w/<slug>` (a workbook page), drawn by `app/site` in the tenant's branding. The proxy rewrites to them; `/site` itself is a 404 everywhere.
- Akana's locked pages, in Akana's own look: `/help-now`, `/help-offline`, `/legal/*`, plus `/tenant.css`, `/covers/*` and `/brand/*` files.

If the tenant cannot be read (the database is unreachable), the tenant pages render a plain "This site is not available right now" page on the server, still carrying Help now, the safety line, the wellness notice and the legal links. Every other path is a 404 on a tenant host, including sign-in, the library, reading and checkout. Reading on tenant hosts waits for shared identity (F-133). Nothing is sold on a tenant site.

## 2. Branding (F-067)

A tenant sets its site name, a logo and favicon (a `/brand/<slug>/` file or a Supabase public file, SVG, PNG or WebP), a main and a second colour for each theme, a heading font from a fixed list, up to five footer links, up to four extra legal links and an email sender name.

Contrast is checked in both themes before save, at 4.5 to 1 (WCAG 2.2 AA for body text):

| Check | Pair |
|---|---|
| Main colour as link text on the page | main colour on the page background |
| Main colour as link text on cards | main colour on the card background |
| Button text on the main colour | white or house ink, whichever is better, on the main colour |
| Header text on the second colour | white or house ink, whichever is better, on the second colour |

The admin form shows the table and refuses a failing pair. The database trigger refuses it again for every caller, staff and server code included (error `AKW01`). The app (`lib/tenant-brand.ts`) and the database (`app.tenant_brand_problems`) use the same formula, and both test files check the same pairs.

The brand reaches the page as CSS custom properties from `/tenant.css`, a generated stylesheet. There are no inline styles and the CSP is unchanged. Only validated hex values and fixed font stacks are written into it. "Powered by Akana" shows unless the tenant's plan is listed in `app_config.powered_by_hidden_plans`, which starts empty because plans are not set.

A tenant's owner can change the site name and brand only. Slug, kind, status, plan, seller of record and the demo flag are Akana's (error `AKW02`).

## 3. Locked standards (F-068)

The brand is a closed shape. There is no setting for custom CSS, scripts, pixels, or for hiding Help now, the wellness notice, safety copy or the privacy pages, so none can be stored: any unknown key is refused. Every tenant page carries Help now in the header and a footer block with the wellness notice, the safety line, the privacy line and links to Help now, the privacy notice, reader terms and cookie statement. Help now keeps Akana's safety colours, which are not brand tokens. Tenant links come after the locked block, never instead of it. A unit test renders the shell and checks all of this.

Wellbeing titles reach a tenant site only once they are live, and the release gate (0016) makes them live only after Akana's safety review. Emails are not sent from tenant sites yet; the sender name is stored for when they are, and the rule that emails never name a title stands.

## 4. Catalogue and own prices (F-069)

`/admin/white-label/<tenant id>` lists the tenant's workbooks with visible, featured, order and a price point. A real tenant may list only its own organisation's workbooks and never a demo title. A demo tenant lists demo titles only (error `AKW03`). The price is a workbook point on the ladder (`AKW04`), the listing's own or else the workbook's. Prices are settings only: there is no tenant checkout, and a real price shows "Not on sale on this site yet".

## 5. The demo publisher and site (F-074)

Quillmoor Demo Press is invented: two imprints (Quillmoor Everyday, Quillmoor Small Hours), two invented authors (Odalys Penhaligon-Reyes, Bram Okonkwo-Lindqvist) and four workbooks, one in each state the portal shows: AK-DEM01 live, AK-DEM02 paused, AK-DEM03 in review, AK-DEM04 draft. Every row is `is_demo` and labelled Demo. Its site lists AK-DEM01 and up to eleven live demo titles from the marketplace catalogue. Demo titles cannot be bought (0004), are kept out of the membership (0010) and so never reach a statement.

The migration writes none of this. Create it with **Reset the demo now** on `/admin/demo`, or wait for the nightly job (`/api/ops/demo-reset`, 02:37 UTC). Fixed ids: organisation `…0000d0`, tenant `…0000d1`, slug `demo`.

**Hosts.** No domain is registered. The demo site answers on:

- `demo.localhost:3000` locally (browsers send `*.localhost` to your machine);
- each host in `DEMO_TENANT_HOSTS`, for example a Vercel alias such as `akana-demo-site.vercel.app` pointed at a preview deployment;
- `demo.<TENANT_APEX>` once the tenant apex is chosen.

All three resolve from config with the fixed id, so the site works with or without `TENANT_DB_LOOKUP`.

**Two looks.** Option A is plum and deep green with book serif headings. Option B is navy and ochre with humanist headings. Both pass every contrast check. Pick one on `/admin/demo`; the nightly reset keeps the last choice.

## 6. Demo logins (F-045): for Crent

No accounts or passwords were created. To set the logins up:

1. In the Supabase dashboard for the project, Authentication, create two users with addresses you control, for example a demo author and a demo publisher address. Use magic link, or set a password yourself. Do not reuse a staff account or anyone's real account.
2. Sign in to `/admin` as a platform owner, open **White-label and demo**, then **Demo publisher and logins**, and register each address as Demo author or Demo publisher. A staff account, or an account in a real organisation, is refused.
3. Press **Reset the demo now**. The publisher login becomes the owner of Quillmoor Demo Press and admin of its site. The author login becomes Odalys Penhaligon-Reyes's profile and an author member.

Every reset, staff or nightly, puts the demo back: names, imprints, authors, the four workbook states, the site's look and catalogue, and the members (the registered logins only; anyone a demo user invited is removed). Workbooks a demo user added are retired, because AK codes are never deleted.

## 7. Not built here

- Test-mode sales, a sample statement and a populated dashboard for the demo publisher (F-045 asks for them). Demo titles cannot be bought by design, so these need a demo-only path in the ledger (0021) that keeps them out of real statements. Left for the ledger owner.
- Uploading a logo from the admin form. Today the logo is a `/brand/` file in the repo or a Supabase public file URL.
- Tenant emails, tenant checkout, custom domains and sign-in on tenant hosts. All after launch.

## 8. Questions for Crent

1. Which demo look, A or B (M7 asks you to choose)?
2. Should "Powered by Akana" be hidden on any plan? Add the plan names to `powered_by_hidden_plans` when plans are set.
3. A suspended tenant shows a 404. Keep that, or show a plain "this site is unavailable" page?
