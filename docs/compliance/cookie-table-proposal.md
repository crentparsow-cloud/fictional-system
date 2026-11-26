DRAFT. Proposed wording, 25 November 2026. Not live. The owner and the solicitor decide.

# Cookie table: proposed wording (review finding M23)

## Why this file exists

The security and compliance review of 21 November 2026 found that the cookie statement lists one cookie and the site sets three. It also found that the page that explains our first-party counting, and lets a visitor turn it off, was linked from nowhere.

The link is fixed in code: both footers now link "What we count" (`/counting`). The cookie statement itself lives in `docs/legal/cookie-statement.md`, which is the text the `/legal/cookies` page shows. That file is owned by the legal documents work, so the change is proposed here and not made there. Nothing on the site changes until this wording is copied into the cookie statement.

## What the site sets today

Checked in the code on 25 November 2026.

| Name | Set by | Holds | Flags |
|---|---|---|---|
| `__Host-akana-auth` | `apps/web/lib/supabase/server.ts`, `apps/web/lib/supabase/proxy.ts` | The sign-in session | HttpOnly, Secure, SameSite=Lax, path `/` |
| `akana_signin_email` | `apps/web/app/(auth)/sign-in/action.ts` | The email address a code was sent to, while the visitor types the code | HttpOnly, Secure on https, SameSite=Lax, path `/sign-in`, 10 minutes |
| `akana_no_count` | `apps/web/app/counting/action.ts` | The value `1` and nothing else | HttpOnly, Secure in production, SameSite=Lax, path `/`, 395 days |

One thing to check before publishing. The sign-in library can split a long session across more than one cookie and adds a short-lived helper cookie during sign-in with Google. Those carry the same name with a suffix (for example `__Host-akana-auth.0`, `__Host-akana-auth.1` and `__Host-akana-auth-code-verifier`). The table below covers them with one row and a note. Confirm this in a browser on the live site before the statement is published.

## Proposed replacement for the section "What we use"

> ## What we use
>
> We use three cookies. All three are our own. None is used for advertising or to follow you between sites.
>
> | Name | Purpose | Set when | Lasts |
> |---|---|---|---|
> | `__Host-akana-auth` | Holds your sign-in session so you stay signed in as you move between pages. A long session can be split across cookies with the same name and a number on the end, and a short-lived cookie with the same name and `-code-verifier` on the end is used while you sign in with Google. | When you sign in | 30 days, or until you sign out |
> | `akana_signin_email` | Remembers the email address we sent your sign-in code to, so you do not have to type it again on the next screen. Sent only to the sign-in page. | When you ask for a sign-in code | 10 minutes, or until you enter the code |
> | `akana_no_count` | Remembers that you turned off counting in this browser. It holds the value 1 and nothing about you. | Only when you choose "Turn counting off" on the What we count page | 13 months, or until you turn counting back on |
>
> The `__Host-` prefix means the cookie is sent only over a secure connection, only to the site that set it, and cannot be read by any other site or subdomain. All three cookies are marked HttpOnly, so scripts in the page cannot read them.
>
> The first two are strictly necessary to provide the service you have asked for. The third is set only when you ask us to stop counting your visits, and exists to carry out that choice. Under the Privacy and Electronic Communications Regulations we do not need your consent to set them, so there is no cookie banner.

## Proposed new section for the cookie statement

To go after "What we do not use".

> ## What we count
>
> To know whether Akana is working we keep a few daily totals on our own servers, such as pages viewed and weeks completed. This does not use a cookie and does not record who you are. You can read what we count and turn it off for your browser on the [What we count](/counting) page. If your browser sends a Global Privacy Control or Do Not Track signal, we do not count your visits and you do not need to do anything.

## Proposed line for the privacy notice

The review asked for the page to be linked from both notices. One sentence, to go where the privacy notice describes what we collect when you use the site:

> We keep daily totals of a few events, with nothing that identifies you. The [What we count](/counting) page says what they are and lets you turn counting off in your browser.

## Two sentences in the current statement that the proposal changes

- "We use one kind of cookie: the cookie that keeps you signed in." becomes "We use three cookies."
- "This cookie is strictly necessary" becomes the paragraph above, which treats the opt-out cookie separately.

## Decisions for the owner and the solicitor

1. Whether the opt-out cookie is described as strictly necessary or, as proposed here, as a cookie set only at the visitor's request. Either way no banner is needed, but the wording should match the solicitor's view.
2. Whether "13 months" is the right way to state 395 days.
3. Whether the suffixed sign-in cookies need rows of their own.
