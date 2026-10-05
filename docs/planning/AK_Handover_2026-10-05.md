# Akana: handover to a new conversation, 5 October 2026

Read this first in the new conversation. It holds everything decided so far and where the files are.

## Where things live

- **Your computer:** `C:\Users\ememe\Downloads\Maya Vaughn-Main Folder\Maya Vaughn\Workbooks App\`
  - `akana-source.zip`: the full source of the current app, workbooks, research, emails and tools as of 2 October.
  - `workbook-app.zip`: the current app build. It goes to Cloudflare Pages by drag and drop.
  - Board decisions, the features roadmap, the naming board paper and the author review file.
  - `saas\`: this handover and the four SaaS research notes.
- **Corrected manuscripts:** `Books\MH_Final\Corrected_v2\` (20 files).
- **Claude project "Project publish part 2":** older docs. It is full, so new files can't be saved there until older docs are removed.
- **GitHub:** private repository `crentparsow-cloud/akana`, created on 5 October and empty. The old session could not reach it.
- **Supabase:**
  - Old project `workbooks-dev` (ref mcehwfsvtzeayluabxyj). It runs the live Focus test.
  - New project `akana-saas` (ref suiuyolccgyjglfwgwnw, London, eu-west-2), created on 5 October and empty.
- **Vercel:** team "crentparsow-cloud's projects" (team_SalOcQ4MW79BWxw8h9u6a6ZZ). No Akana project yet.
- **Live test app:** workbooks-app-dev.pages.dev on Cloudflare Pages.

## What Akana is now

It is "the place where books become practical": a SaaS that turns books into interactive guided workbooks, for many authors and publishers across countries and genres. The business summary is `saas\Akana_conversation_summary.md`.

My read of that summary, already given to Crent:
- **Subscription revenue:** the revenue model counts all of it as Akana's. Authors will expect a share. At a 50% author pool, Year 3 falls from about £1.0m to about £645k.
- **Two offers conflict:** "no upfront cost" and author development fees are both counted. Only one can apply to a given author.
- **Market claims:** the named competitors needed checking. The research notes do this.
- **Build sequence:** the summary warns against building the full platform first. The agreed answer is to build the core platform now and launch it narrow.
- **Outside code:** a sellable product also needs a company, a domain, an Akana trade mark check, legal documents, Stripe and Connect onboarding, a VAT approach, a support email and some real licensed content. Demo content can't be sold.

## Crent's decisions on 5 October 2026

1. **Model:** both. A curated multi-author marketplace and subscription library, with an author portal and publisher accounts, plus a white-label tier where publishers run their own branded workbook site.
2. **Demo content:** invented authors clearly marked as demo, plus some real public-domain classics.
3. **Demo size:** about 50 workbooks in total across at least 17 authors, at mixed depth. Every workbook gets a full listing, cover, outline and usable first week. About one per author is fully written.
4. **Stack:** rebuild on Next.js and TypeScript. Supabase is a new project (done: akana-saas). Stripe with Stripe Connect handles author payouts. Hosting is on Vercel. The code goes in a private GitHub repo.
5. **Currency:** GBP first, with local currency where possible.
6. **Timeline:** a full working, sellable product in three weeks, from Monday 5 October to Friday 23 October 2026.
7. **Content issues:** the Maya Vaughn workbook content issues are parked for now. Focus is on building the app.
8. **Questions:** Claude asks whenever something is unclear.

## Earlier decisions that carry over

- **Identity:** book title, author and a permanent AK- code. Positive names become shared Themes. Emails and partner emails show only the Theme.
- **Wellbeing rules:**
  - wellness, not treatment;
  - no effectiveness claims, no diagnosis;
  - health data handled as health data;
  - no ad pixels, no streaks that punish;
  - Help now one tap away;
  - a single Safety and support hub.
- **Higher-tier workbooks:** the six higher-tier Maya Vaughn workbooks stay unreleased until a clinician signs them off. Focus stays live.
- **Outside gates:**
  - A trade mark attorney must clear AKANA. Perforce sells an API product under that name.
  - A lawyer must approve device status, consent, terms and marketing copy.
  - A clinician must sign off the safety items.
- **Postal address:** a placeholder. Marketing email stays off until a real address exists.

## Planning outputs (finished 5 October, in the saas folder)

- `AK_Feature_List.md` and `.json`: 147 features, prioritised as Week 1 (25), Week 2 (39), Week 3 (36) and After launch (47).
- `AK_Architecture.md`: one Next.js project on Vercel Pro, with tenants by `tenant_id` and row level security in Supabase, seven surfaces, a data model with ERDs, and charging and payouts.
- `AK_Demo_Catalogue_Plan.md` and `.json`: 50 demo workbooks. 45 are by 18 invented authors from 18 countries. 5 are public-domain classics (Bennett, Marcus Aurelius in Long's translation, Franklin, Charlotte Mason, Smiles).
- `AK_3_Week_Plan.md`: a day-by-day plan for week 1 and milestones for weeks 2 and 3, with a go or no-go meeting at 15:00 on Friday 23 October and possible launch on Monday 26 October.
- `AK_Questions_for_Crent.md`: 54 questions, each with a recommended answer. The urgent ones:
  - A1: Akana as seller of record;
  - B1: demo volume;
  - E1: a staging database;
  - D1 to D3: charging model, revenue share and the subscription pool split;
  - C4: price ladder;
  - C5: launch countries;
  - B4: demo workbooks never for sale;
  - E5: a second reviewer.
- Research notes: market, white-label, payments and royalties, and rights.

Key findings to carry forward:
- **Seller of record.** Akana must be the seller of record itself. Stripe Managed Payments, Paddle and Lemon Squeezy exclude marketplaces.
- **VAT.** Akana owes VAT or GST on the full reader price in the UK, EU, Australia and New Zealand.
- **White-label.** It ships as a demo tenant only at launch.
- **Builder.** The no-code builder and manuscript import come after launch.

## First steps for the new conversation

1. Start the new task with the GitHub repository `crentparsow-cloud/akana` selected, with write access, and your Workbooks App folder connected.
2. Unzip `akana-source.zip` into the workspace to recover the current app, workbooks, schema, validator, emails and tools.
3. Read the planning outputs in the saas folder and answer the urgent questions in AK_Questions_for_Crent.md.
4. Scaffold the Next.js app in the repository, connect Vercel to it, and point it at the akana-saas Supabase project. Crent adds any secret keys himself.
5. Build in the order the three-week plan sets. Keep the outside-code track (company, domain, trade mark, legal, Stripe) running alongside.
