// The one layout every Akana email shares (Daylight Blocks), ported from
// legacy/functions/_shared/emails.ts.
//
// Voice: understanding, helpful, calm. Second person, short sentences, plain
// words. No dashes, no emojis. Subject lines never name a title, a theme, a
// topic or a condition. Each template returns structured parts (headline,
// paragraphs, panels, buttons). render() turns them into table-based HTML
// with inline styles, and a plain-text version laid out by hand.
//
// Stage names are free in workbook schema v3, so the layout takes a list of
// stage labels and an index rather than fixed ids. Nothing here assumes a
// programme length.

export type Button = { label: string; url: string };
export type Hero = "stage-1" | "stage-2" | "stage-3" | "stage-4" | "service" | "partner" | "brand" | "author";
export type FooterKind =
  | "service"
  | "progress"
  | "marketing"
  | "partner"
  | "partner_invite"
  | "partner_stopped"
  | "deleted"
  | "signin"
  | "author";
export type Panel = {
  title?: string;
  big?: string; // a large single value, such as a date
  spaced?: boolean; // wide letter spacing for the big value, for codes
  rows?: [string, string][]; // a small two-column table, such as a receipt
  items?: string[]; // a short list
  lines?: string[]; // short paragraphs
  quote?: string; // words from the reader, shown as a quote
  tone?: "tint" | "terms" | Hero; // tint: soft neutral. terms: white with a border. Hero ids use that band.
};
export type StageStrip = { labels: string[]; upTo: number }; // filled up to and including index upTo
export type Email = {
  subject: string;
  preheader: string;
  hero: Hero;
  eyebrow?: string;
  headline: string;
  badge?: string; // marigold pill, for achievement moments only
  strip?: StageStrip;
  greeting?: string;
  paragraphs: string[];
  panels?: Panel[];
  after?: string[]; // paragraphs after the panels
  buttons?: Button[]; // first is primary, the rest are quieter
  equalButtons?: boolean; // show every button with the same weight
  quietLink?: Button; // a plain text link under the buttons, for a quiet "no"
  signoff?: boolean; // default true
  footer: FooterKind;
};
export type FooterLinks = { manage?: string; unsubscribe?: string; oneClick?: string; stop?: string; report?: string };
export type Footer = { buttons: Button[]; textLinks: Button[]; lines: string[]; company: string; safety: boolean };
export type Rendered = { subject: string; text: string; html: string };

export const BRAND = "Akana";
export const SIGNOFF = ["Take care,", `The ${BRAND} team`];
export const SAFETY = `${BRAND} is not an emergency service. If you are in danger, call your local emergency number.`;

/** Stage tints by position. A workbook with more than four stages wraps. */
export const stageHero = (index: number): Hero => `stage-${((Math.max(0, index) % 4) + 1) as 1 | 2 | 3 | 4}`;

// ---------- colour ----------
const C = {
  page: "#F7F5F0",
  card: "#FFFFFF",
  ink: "#16222B",
  soft: "#4A5864",
  brand: "#1F4E5A",
  marigold: "#F2B84B",
  tint: "#F4F2EC",
  rule: "#E4E0D7",
};
const BANDS: Record<Hero, { bg: string; ink: string; darkBg: string; darkInk: string }> = {
  "stage-1": { bg: "#DCEBE2", ink: "#2D6A4F", darkBg: "#1C3027", darkInk: "#9FD3B6" },
  "stage-2": { bg: "#F8E0D0", ink: "#9C4A25", darkBg: "#38241A", darkInk: "#F0B391" },
  "stage-3": { bg: "#F6EAC0", ink: "#6E520F", darkBg: "#332A12", darkInk: "#E8C873" },
  "stage-4": { bg: "#D6E6F3", ink: "#1F5A85", darkBg: "#172A3A", darkInk: "#9CC6EA" },
  service: { bg: "#D6E6F3", ink: "#1F5A85", darkBg: "#172A3A", darkInk: "#9CC6EA" },
  partner: { bg: "#EFE7DA", ink: "#6B5232", darkBg: "#2E2820", darkInk: "#D9C3A3" },
  brand: { bg: "#E1ECEE", ink: "#1F4E5A", darkBg: "#16303A", darkInk: "#9FCBD6" },
  author: { bg: "#E1ECEE", ink: "#1F4E5A", darkBg: "#16303A", darkInk: "#9FCBD6" },
};

// Mix a colour toward a background, so the mark needs no opacity (Outlook ignores it).
function mix(fg: string, bg: string, a: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [f, b] = [p(fg), p(bg)];
  return (
    "#" +
    f
      .map((c, i) =>
        Math.round(c * a + (b[i] ?? 0) * (1 - a))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

// ---------- footer ----------
const PLACEHOLDER_COMPANY = "[Company name], [company address]";

/** True when the postal address is missing or still a placeholder. The mailer refuses marketing and progress mail in that state. */
export function isPostalPlaceholder(postal: string | null | undefined): boolean {
  const p = (postal ?? "").trim();
  return !p || p.toUpperCase() === "PLACEHOLDER" || p.startsWith("[");
}

/** The footer for each kind of email. Returns buttons and lines. */
export function footerText(kind: FooterKind, links: FooterLinks, postal?: string | null, otherName?: string): Footer {
  const company = isPostalPlaceholder(postal) ? PLACEHOLDER_COMPANY : (postal ?? "").trim();
  const other = otherName && otherName.trim() ? otherName.trim() : "your friend";
  const settings = links.manage ? [{ label: "Email settings", url: links.manage }] : [];
  const unsub = links.unsubscribe ?? links.oneClick;
  switch (kind) {
    case "progress":
      return {
        buttons: [...(unsub ? [{ label: "Unsubscribe", url: unsub }] : []), ...settings],
        textLinks: [],
        lines: [`You're getting this because you turned on progress emails and reminders in ${BRAND}.`],
        company,
        safety: true,
      };
    case "marketing":
      return {
        buttons: [...(unsub ? [{ label: "Unsubscribe", url: unsub }] : []), ...settings],
        textLinks: [],
        lines: [`This is a marketing email from ${BRAND}. Unsubscribe anytime and these emails stop.`],
        company,
        safety: true,
      };
    case "partner":
      return {
        buttons: links.stop ? [{ label: "Stop these updates", url: links.stop }] : [],
        textLinks: [],
        lines: [`You're getting this because you agreed to get updates about ${other}. Stopping is instant, and ${other} isn't told why.`],
        company,
        safety: false,
      };
    case "partner_invite":
      return {
        buttons: links.report ? [{ label: "Report this", url: links.report }] : [],
        textLinks: [],
        lines: [`Sent by ${BRAND} on behalf of ${other}. Not expecting this email? Report it, and no more invitations will reach this address.`],
        company,
        safety: false,
      };
    case "partner_stopped":
      return { buttons: [], textLinks: [], lines: [`This is the last email you'll get about ${other}.`], company, safety: false };
    case "deleted":
      return { buttons: [], textLinks: [], lines: [`This email confirms a request made in your ${BRAND} account.`], company, safety: false };
    case "signin":
      return {
        buttons: [],
        textLinks: links.manage ? [{ label: "Email settings", url: links.manage }] : [],
        lines: [`You're getting this because someone used this address to sign in to ${BRAND}.`],
        company,
        safety: false,
      };
    case "author":
      return {
        buttons: settings,
        textLinks: [],
        lines: [`This email is about your ${BRAND} publishing account, so it can't be turned off.`],
        company,
        safety: false,
      };
    case "service":
    default:
      return {
        buttons: settings,
        textLinks: [],
        lines: ["This email is about your account, so it can't be turned off."],
        company,
        safety: true,
      };
  }
}

// ---------- rendering ----------
export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const F = `font-family:${FONT};`;

function css(hero: Hero, tones: Hero[]): string {
  const b = BANDS[hero];
  const toneCss = [...new Set(tones)]
    .map((t) => {
      const x = BANDS[t];
      return `.pn-${t}{background:${x.darkBg}!important}.pt-${t}{color:${x.darkInk}!important}`;
    })
    .join("");
  const dark = `.bg-page{background:#0F1519!important}.card{background:#1A2329!important}
.ink{color:#E9EEF1!important}.soft{color:#AEBBC4!important}.brandtxt{color:#9FCBD6!important}
.hero{background:${b.darkBg}!important}.hink{color:${b.darkInk}!important}
.mk1{background:${mix(b.darkInk, b.darkBg, 0.55)}!important}.mk2{background:${mix(b.darkInk, b.darkBg, 0.78)}!important}.mk3{background:${b.darkInk}!important}
.pn-tint{background:#222D35!important}.pn-terms{background:#1A2329!important;border-color:#3A4650!important}
.rule{border-color:#33404A!important}.seg-off{background:#33404A!important}
.pill{border-color:#5C6B75!important}.pill a{color:#D3DCE2!important}
.btn2{background:#1A2329!important;border-color:#9FCBD6!important}.btn2 a{color:#9FCBD6!important}
${toneCss}`;
  return `:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0;padding:0;-webkit-text-size-adjust:100%}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
@media (max-width:600px){.px{padding-left:20px!important;padding-right:20px!important}.h1{font-size:26px!important}.big{font-size:24px!important}}
@media (prefers-color-scheme:dark){${dark}}
[data-ogsc] .ink{color:#E9EEF1!important}[data-ogsc] .soft{color:#AEBBC4!important}[data-ogsc] .hink{color:${b.darkInk}!important}
[data-ogsb] .bg-page{background:#0F1519!important}[data-ogsb] .card{background:#1A2329!important}[data-ogsb] .hero{background:${b.darkBg}!important}`;
}

function mark(hero: Hero): string {
  const b = BANDS[hero];
  const cell = (h: number, color: string, cls: string, last = false) =>
    `<td valign="bottom" style="padding:0 ${last ? 0 : 4}px 0 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="${cls}" width="12" height="${h}" bgcolor="${color}" style="width:12px;height:${h}px;background:${color};border-radius:3px;font-size:0;line-height:0">&nbsp;</td></tr></table></td>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" aria-hidden="true" style="margin:0 0 18px"><tr>${cell(
    12,
    mix(b.ink, b.bg, 0.55),
    "mk1",
  )}${cell(19, mix(b.ink, b.bg, 0.78), "mk2")}${cell(26, b.ink, "mk3", true)}</tr></table>`;
}

function strip(s: StageStrip): string {
  const n = s.labels.length;
  if (!n) return "";
  const width = Math.floor(100 / n);
  const cells = s.labels
    .map((label, i) => {
      const on = i <= s.upTo;
      const bar = on ? BANDS[stageHero(i)].ink : "#FFFFFF";
      return `<td width="${width}%" valign="top" style="padding:0 ${i < n - 1 ? 4 : 0}px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td ${
        on ? "" : 'class="seg-off" '
      }height="6" bgcolor="${bar}" style="height:6px;background:${bar};border-radius:3px;font-size:0;line-height:0">&nbsp;</td></tr></table>
<p class="${on ? "ink" : "soft"}" style="margin:6px 0 0;${F}font-size:12px;line-height:1.3;font-weight:${on ? 700 : 400};color:${
        on ? C.ink : C.soft
      }">${esc(label)}</p></td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0"><tr>${cells}</tr></table>`;
}

function button(b: Button, style: "primary" | "secondary"): string {
  const primary = style === "primary";
  const bg = primary ? C.brand : C.card;
  const fg = primary ? "#FFFFFF" : C.brand;
  const width = Math.max(160, Math.round(b.label.length * 9.5 + 56));
  const vml = `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(
    b.url,
  )}" style="height:48px;v-text-anchor:middle;width:${width}px" arcsize="25%" ${
    primary ? 'stroke="f"' : `strokecolor="${C.brand}" strokeweight="1.5px"`
  } fillcolor="${bg}"><w:anchorlock/><center style="color:${fg};font-family:Arial,sans-serif;font-size:17px;font-weight:bold">${esc(
    b.label,
  )}</center></v:roundrect><![endif]-->`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr><td>${vml}<!--[if !mso]><!--><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td ${primary ? "" : 'class="btn2" '}align="center" bgcolor="${bg}" style="border-radius:12px;background:${bg};${
    primary ? "" : `border:1.5px solid ${C.brand};`
  }">
<a href="${esc(
    b.url,
  )}" style="display:inline-block;padding:0 26px;height:48px;line-height:48px;${F}font-size:17px;font-weight:600;color:${fg};text-decoration:none;border-radius:12px">${esc(
    b.label,
  )}</a></td></tr></table><!--<![endif]--></td></tr></table>`;
}

function pill(b: Button): string {
  return `<td style="padding:0 4px 8px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="pill" style="border:1px solid #9AA6AE;border-radius:999px">
<a href="${esc(b.url)}" style="display:inline-block;padding:9px 18px;${F}font-size:14px;font-weight:600;line-height:20px;color:${
    C.soft
  };text-decoration:none;border-radius:999px">${esc(b.label)}</a></td></tr></table></td>`;
}

function panel(p: Panel): string {
  const tone = p.tone ?? "tint";
  const isBand = tone !== "tint" && tone !== "terms";
  const bg = tone === "terms" ? C.card : isBand ? BANDS[tone].bg : C.tint;
  const titleColor = isBand ? BANDS[tone].ink : C.ink;
  const border = tone === "terms" ? `border:1px solid ${C.rule};` : "";
  const parts: string[] = [];
  if (p.title) {
    parts.push(
      `<p class="${isBand ? `pt-${tone}` : "ink"}" style="margin:0 0 10px;${F}font-size:15px;line-height:1.4;font-weight:700;color:${titleColor}">${esc(
        p.title,
      )}</p>`,
    );
  }
  if (p.big)
    parts.push(
      `<p class="ink big" style="margin:0 0 ${p.rows ? 12 : 0}px;${F}font-size:${p.spaced ? 32 : 28}px;line-height:1.2;font-weight:700;color:${
        C.ink
      };${p.spaced ? "letter-spacing:6px;" : ""}">${esc(p.big)}</p>`,
    );
  if (p.rows?.length) {
    parts.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${p.rows
        .map(
          ([k, val], i) =>
            `<tr><td class="soft${i ? " rule" : ""}" valign="top" style="padding:8px 12px 8px 0;white-space:nowrap;${
              i ? `border-top:1px solid ${C.rule};` : ""
            }${F}font-size:15px;line-height:1.4;color:${C.soft}">${esc(k)}</td>` +
            `<td class="ink${i ? " rule" : ""}" valign="top" align="right" style="padding:8px 0;${
              i ? `border-top:1px solid ${C.rule};` : ""
            }${F}font-size:15px;line-height:1.4;font-weight:600;color:${C.ink};text-align:right">${esc(val)}</td></tr>`,
        )
        .join("")}</table>`,
    );
  }
  if (p.items?.length) {
    const dot = isBand ? BANDS[tone].ink : C.brand;
    parts.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${p.items
        .map(
          (it) =>
            `<tr><td width="18" valign="top" style="padding:9px 0 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="8" height="8" bgcolor="${dot}" style="width:8px;height:8px;background:${dot};border-radius:2px;font-size:0;line-height:0">&nbsp;</td></tr></table></td>` +
            `<td class="ink" valign="top" style="padding:0 0 8px;${F}font-size:16px;line-height:1.55;color:${C.ink}">${esc(it)}</td></tr>`,
        )
        .join("")}</table>`,
    );
  }
  if (p.quote) {
    parts.push(
      `<p class="ink" style="margin:0;${F}font-size:17px;line-height:1.55;font-style:italic;color:${C.ink}">&ldquo;${esc(p.quote)}&rdquo;</p>`,
    );
  }
  for (const [i, l] of (p.lines ?? []).entries()) {
    parts.push(
      `<p class="ink" style="margin:${i || p.items?.length || p.rows?.length || p.big ? 8 : 0}px 0 0;${F}font-size:16px;line-height:1.55;color:${
        C.ink
      }">${esc(l)}</p>`,
    );
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px"><tr>
<td class="pn-${tone}" bgcolor="${bg}" style="background:${bg};${border}border-radius:12px;padding:18px 20px">${parts.join("\n")}</td></tr></table>`;
}

function textVersion(email: Email, foot: Footer): string {
  const out: string[] = [];
  out.push(email.headline.toUpperCase());
  if (email.badge) out.push(email.badge);
  if (email.eyebrow) out.push(email.eyebrow);
  if (email.greeting) out.push(email.greeting);
  out.push(...email.paragraphs);
  for (const p of email.panels ?? []) {
    const block: string[] = [];
    if (p.title) block.push(p.title);
    if (p.big) block.push(p.big);
    for (const [k, val] of p.rows ?? []) block.push(`${k}: ${val}`);
    for (const it of p.items ?? []) block.push(`- ${it}`);
    if (p.quote) block.push(`"${p.quote}"`);
    block.push(...(p.lines ?? []));
    out.push(block.join("\n"));
  }
  out.push(...(email.after ?? []));
  const actions = [...(email.buttons ?? []), ...(email.quietLink ? [email.quietLink] : [])];
  if (actions.length) out.push(actions.map((b) => `${b.label}:\n${b.url}`).join("\n\n"));
  if (email.signoff !== false) out.push(SIGNOFF.join("\n"));
  const footer: string[] = [];
  footer.push(...[...foot.buttons, ...foot.textLinks].map((b) => `${b.label}: ${b.url}`));
  footer.push(...foot.lines);
  if (foot.safety) footer.push(SAFETY);
  footer.push(`${BRAND}. ${foot.company}`);
  return out.join("\n\n") + "\n\n-- \n" + footer.join("\n") + "\n";
}

/** Renders an email to subject, plain text and HTML. `lang` sets the html lang attribute. */
export function render(email: Email, foot: Footer, lang = "en-GB"): Rendered {
  const band = BANDS[email.hero];
  const tones = (email.panels ?? []).map((p) => p.tone).filter((t): t is Hero => !!t && t !== "tint" && t !== "terms");
  const pad = "&#847;&zwnj;&nbsp;".repeat(60);

  const hero = `<td class="hero px" bgcolor="${band.bg}" style="background:${band.bg};border-radius:16px 16px 0 0;padding:28px 28px 26px">
${mark(email.hero)}
${
  email.badge
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px"><tr><td bgcolor="${C.marigold}" style="background:${C.marigold};border-radius:999px;padding:5px 12px;${F}font-size:13px;line-height:18px;font-weight:700;color:${C.ink}">${esc(
        email.badge,
      )}</td></tr></table>`
    : ""
}
${
  email.eyebrow && !email.badge
    ? `<p class="hink" style="margin:0 0 8px;${F}font-size:14px;line-height:1.4;font-weight:700;color:${band.ink}">${esc(email.eyebrow)}</p>`
    : ""
}
<h1 class="ink h1" style="margin:0;${F}font-size:28px;line-height:1.25;font-weight:700;color:${C.ink};letter-spacing:-0.2px">${esc(email.headline)}</h1>
${email.strip ? strip(email.strip) : ""}
</td>`;

  const p = (s: string, extra = "") =>
    `<p class="ink" style="margin:0 0 16px;${F}font-size:17px;line-height:1.6;color:${C.ink};${extra}">${esc(s)}</p>`;
  const buttons = email.buttons ?? [];
  const body = `<td class="px" style="padding:28px 28px 12px">
${email.greeting ? p(email.greeting) : ""}
${email.paragraphs.map((s) => p(s)).join("\n")}
${(email.panels ?? []).map(panel).join("\n")}
${(email.after ?? []).map((s) => p(s)).join("\n")}
${
  buttons.length
    ? `<div style="padding:4px 0 8px">${buttons.map((b, i) => button(b, i === 0 && !email.equalButtons ? "primary" : "secondary")).join("\n")}</div>`
    : ""
}
${
  email.quietLink
    ? `<p style="margin:0 0 20px;${F}font-size:16px;line-height:1.5"><a href="${esc(email.quietLink.url)}" class="soft" style="color:${
        C.soft
      };text-decoration:underline">${esc(email.quietLink.label)}</a></p>`
    : ""
}
${
  email.signoff !== false
    ? `<p class="ink" style="margin:8px 0 16px;${F}font-size:17px;line-height:1.6;color:${C.ink}">${SIGNOFF.map(esc).join("<br>")}</p>`
    : ""
}
</td>`;

  const small = (s: string, extra = "") => `<p class="soft" style="margin:0 0 8px;${F}font-size:13px;line-height:1.55;color:${C.soft};${extra}">${s}</p>`;
  const footer = `<td align="center" style="padding:24px 16px 8px;text-align:center">
${
  foot.buttons.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 8px"><tr>${foot.buttons
        .map(pill)
        .join("")}</tr></table>`
    : ""
}
${foot.textLinks.map((l) => small(`<a href="${esc(l.url)}" class="soft" style="color:${C.soft};text-decoration:underline">${esc(l.label)}</a>`)).join("\n")}
${foot.lines.map((l) => small(esc(l))).join("\n")}
${foot.safety ? small(esc(SAFETY)) : ""}
${small(`<strong>${BRAND}</strong> &middot; ${esc(foot.company)}`, "margin-bottom:0")}
</td>`;

  const html = `<!doctype html>
<html lang="${esc(lang)}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(email.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>body,table,td,p,a,h1{font-family:Arial,sans-serif!important}</style><![endif]-->
<style>${css(email.hero, tones)}</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page}">${esc(
    email.preheader,
  )}${pad}</div>
<table role="presentation" class="bg-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page}"><tr><td align="center" style="padding:20px 12px 32px">
<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto">
<tr><td style="padding:4px 8px 14px"><span class="brandtxt" style="${F}font-size:20px;line-height:1.2;font-weight:700;letter-spacing:-0.2px;color:${C.brand}">${BRAND}</span></td></tr>
<tr><td class="card" bgcolor="${C.card}" style="background:${C.card};border-radius:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>${hero}</tr>
<tr>${body}</tr>
</table>
</td></tr>
<tr>${footer}</tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
  return { subject: email.subject, text: textVersion(email, foot), html };
}
