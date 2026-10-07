import { LAUNCH_MARKETS, MARKETS, helpNowFor, type MarketCode } from "@/lib/markets";
import { SUPPORT_CHECKED, contactHref, emergencyFor, supportLinesFor } from "@/lib/support-lines";

/**
 * The offline Help now page (F-140). One static HTML document with every
 * market's crisis lines as tel: and sms: links, so it works signed out, with
 * no JavaScript and with no network once the service worker holds it.
 *
 * Built from the same typed data as /help-now, at build time. It has no
 * script, no inline style (the stylesheet is the one other cached file) and
 * no reader data of any kind.
 */

export const OFFLINE_HELP_PATH = "/help-offline";
export const OFFLINE_HELP_CSS = "/help-offline.css";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const ORDER: readonly MarketCode[] = [...LAUNCH_MARKETS, "XX"];

function marketBlock(code: MarketCode): string {
  const m = MARKETS[code];
  const em = emergencyFor(code);
  const call = (href: string, label: string, how: string, number: string) =>
    `<a class="call" href="${esc(href)}"><span class="label">${esc(label)}<span class="how">${esc(how)}</span></span><span class="num">${esc(number)}</span></a>`;
  const emergency = em.number
    ? call(`tel:${em.number.replace(/[^\d+]/g, "")}`, em.label, em.how, em.number)
    : `<p class="plain">${esc(em.how)}.</p>`;
  const now = helpNowFor(code)
    .map((l) => call(contactHref({ number: l.number, how: l.how, url: `https://${l.number}` }), l.label, l.how, l.number))
    .join("");
  const groups = supportLinesFor(code)
    .filter((g) => !(code === "XX" && g.id === "crisis"))
    .map(
      (g) =>
        // Shown open, never folded away: a number inside a closed disclosure
        // is hidden from screen readers and one tap further from anyone.
        `<div class="group"><h3>${esc(g.title)}</h3>${g.note ? `<p class="note">${esc(g.note)}</p>` : ""}${g.lines
          .map((l) => call(contactHref(l), l.name, `${l.how}${l.hours ? `. ${l.hours}` : ""}`, l.number))
          .join("")}</div>`,
    )
    .join("");
  return `<section class="market" id="m-${code.toLowerCase()}" aria-labelledby="h-${code.toLowerCase()}"><h2 id="h-${code.toLowerCase()}">${esc(m.name)}</h2>${emergency}${now}${groups}</section>`;
}

export function offlineHelpHtml(): string {
  const date = new Date(`${SUPPORT_CHECKED}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const jump = ORDER.map((c) => `<a class="chip" href="#m-${c.toLowerCase()}">${esc(MARKETS[c].name)}</a>`).join("");
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Help now</title>
<link rel="stylesheet" href="${OFFLINE_HELP_CSS}">
</head>
<body>
<header class="head">
<p class="brand">Akana</p>
<h1>Help now</h1>
<p class="lead">If you are in danger or thinking about ending your life, call your local emergency number now. You do not have to be sure it is serious enough.</p>
<p class="offline">This page works without the internet. Phone numbers still work when the app does not.</p>
</header>
<main>
<nav class="chips" aria-label="Choose your country">${jump}</nav>
${ORDER.map(marketBlock).join("\n")}
<p class="small">Emergency: US and Canada 911. UK 999. Ireland 112. Australia 000. New Zealand 111.</p>
<p class="small">Every number on this page was checked against its official source on ${esc(date)}.</p>
<p class="small"><a href="/help-now">Open the full Help now page</a></p>
</main>
</body>
</html>
`;
}
