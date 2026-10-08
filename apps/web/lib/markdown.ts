/**
 * The small Markdown subset used by the legal drafts (F-121) and the help
 * centre (F-010): headings, paragraphs, lists, tables, bold, inline code and
 * links. Everything is escaped first, so the output carries no markup the
 * source did not ask for. Links are allowed only to a path on this site,
 * to https, or to mailto, so a file can never inject a script URL.
 *
 * Pure, so it is unit tested and runs at build time.
 */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const LINK = /\[([^\]]+)\]\(((?:\/(?!\/)|https:\/\/|mailto:)[^\s)]*)\)/g;

export function inlineMarkdown(s: string): string {
  return escapeHtml(s)
    .replace(LINK, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function tableRow(line: string, cell: "td" | "th") {
  const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|");
  return `<tr>${cells.map((c) => `<${cell}>${inlineMarkdown(c.trim())}</${cell}>`).join("")}</tr>`;
}

export function markdownToHtml(md: string): string {
  const out: string[] = [];
  const lines = md.split(/\r?\n/);
  const at = (n: number) => lines[n] ?? "";
  let i = 0;
  // The last heading's plain text names the scroll region around a table.
  let lastHeading = "";
  while (i < lines.length) {
    const line = at(i);
    if (line.trim() === "") {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = (h[1] ?? "#").length;
      out.push(`<h${level}>${inlineMarkdown(h[2] ?? "")}</h${level}>`);
      lastHeading = (h[2] ?? "").replace(/\*\*|`/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim();
      i++;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(at(i))) {
        items.push(`<li>${inlineMarkdown(at(i).replace(/^[-*]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(at(i))) {
        items.push(`<li>${inlineMarkdown(at(i).replace(/^\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    if (line.startsWith("|")) {
      const head = tableRow(line, "th");
      i++;
      if (i < lines.length && /^\|[\s:|-]+\|$/.test(at(i))) i++;
      const rows: string[] = [];
      while (i < lines.length && at(i).startsWith("|")) {
        rows.push(tableRow(at(i), "td"));
        i++;
      }
      // F-144: a wide table scrolls sideways on a phone, so its wrapper is a
      // named, focusable region that a keyboard user can scroll.
      const label = escapeHtml(lastHeading ? `Table: ${lastHeading}` : "Table");
      out.push(
        `<div class="md-table" role="region" aria-label="${label}" tabindex="0"><table><thead>${head}</thead><tbody>${rows.join("")}</tbody></table></div>`,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && at(i).trim() !== "" && !/^(#{1,3}\s|[-*]\s|\d+\.\s|\|)/.test(at(i))) {
      para.push(at(i));
      i++;
    }
    out.push(`<p>${inlineMarkdown(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

/** The first "# " heading, without the hashes. */
export function firstHeading(md: string): string | null {
  const m = /^#\s+(.+)$/m.exec(md);
  return m ? (m[1] ?? "").trim() : null;
}

/** The first plain paragraph, with Markdown marks removed, for a meta description. */
export function firstParagraph(md: string): string | null {
  const blocks = md.split(/\r?\n\s*\r?\n/);
  for (const b of blocks) {
    const t = b.trim();
    if (!t || /^(#|[-*]\s|\d+\.\s|\|)/.test(t)) continue;
    return t
      .replace(/\s+/g, " ")
      .replace(LINK, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
  }
  return null;
}
