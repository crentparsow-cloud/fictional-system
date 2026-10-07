/**
 * A very small PDF writer for statements (F-101). No dependency: A4 pages,
 * the standard Helvetica, Helvetica-Bold and Courier fonts, text only. Each
 * line says which font and size it uses; tables are set in Courier so
 * columns line up without measuring text. Text is encoded as WinAnsi; a
 * character outside it becomes "?".
 */

export type PdfFont = "regular" | "bold" | "mono";

export interface PdfLine {
  text: string;
  font?: PdfFont;
  size?: number;
  /** Extra space above the line, in points. */
  gap?: number;
}

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 50;
const FONT_KEYS: Record<PdfFont, string> = { regular: "F1", bold: "F2", mono: "F3" };

/** WinAnsi bytes for the few characters outside Latin-1 that statements may carry. */
const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "–": 0x96,
  "—": 0x97,
  "…": 0x85,
};

/** Encode one string as escaped WinAnsi bytes for a PDF literal string. */
export function pdfStringBytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    let code = WIN_ANSI_EXTRA[ch];
    if (code === undefined) {
      const cp = ch.codePointAt(0) ?? 63;
      code = (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) ? cp : 63;
    }
    if (code === 0x28 || code === 0x29 || code === 0x5c) out.push(0x5c);
    out.push(code);
  }
  return out;
}

/** Append without spreading, so a long stream never hits the argument limit. */
function append(into: number[], from: readonly number[]): void {
  for (const b of from) into.push(b);
}

function ascii(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0) & 0xff);
}

/** Lay lines out top to bottom, starting a new page when one is full. */
export function paginate(lines: PdfLine[]): PdfLine[][] {
  const pages: PdfLine[][] = [];
  let current: PdfLine[] = [];
  let y = PAGE_H - MARGIN;
  for (const line of lines) {
    const size = line.size ?? 10;
    const step = size * 1.4 + (line.gap ?? 0);
    if (y - step < MARGIN && current.length > 0) {
      pages.push(current);
      current = [];
      y = PAGE_H - MARGIN;
    }
    current.push(line);
    y -= step;
  }
  pages.push(current);
  return pages;
}

function contentStream(page: PdfLine[], pageNo: number, pageCount: number, footer: string): number[] {
  const out: number[] = [];
  let y = PAGE_H - MARGIN;
  for (const line of page) {
    const size = line.size ?? 10;
    y -= size * 1.4 + (line.gap ?? 0);
    append(out, ascii(`BT /${FONT_KEYS[line.font ?? "regular"]} ${size} Tf ${MARGIN} ${y.toFixed(2)} Td (`));
    append(out, pdfStringBytes(line.text));
    append(out, ascii(") Tj ET\n"));
  }
  const foot = `${footer}  Page ${pageNo} of ${pageCount}`;
  append(out, ascii(`BT /F1 8 Tf ${MARGIN} ${MARGIN - 20} Td (`));
  append(out, pdfStringBytes(foot));
  append(out, ascii(") Tj ET\n"));
  return out;
}

/** Build the whole PDF file. */
export function buildPdf(lines: PdfLine[], opts: { title: string; footer?: string }): Uint8Array {
  const pages = paginate(lines);
  const objects = new Map<number, number[]>();
  // 1 catalog, 2 pages, 3..5 fonts, 6 info, then a page and a stream per page
  const pageIds = pages.map((_, i) => 7 + i * 2);
  objects.set(1, ascii("<< /Type /Catalog /Pages 2 0 R >>"));
  objects.set(2, ascii(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`));
  objects.set(3, ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  objects.set(4, ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
  objects.set(5, ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>"));
  objects.set(6, [...ascii("<< /Title ("), ...pdfStringBytes(opts.title), ...ascii(") /Producer (Akana) >>")]);
  pages.forEach((page, i) => {
    const pageId = 7 + i * 2;
    const stream = contentStream(page, i + 1, pages.length, opts.footer ?? "");
    objects.set(
      pageId,
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
      ),
    );
    const body = ascii(`<< /Length ${stream.length} >>\nstream\n`);
    append(body, stream);
    append(body, ascii("\nendstream"));
    objects.set(pageId + 1, body);
  });

  const count = objects.size + 1;
  const bytes: number[] = [...ascii("%PDF-1.4\n%"), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a];
  const offsets: number[] = [0];
  for (let id = 1; id < count; id++) {
    offsets.push(bytes.length);
    append(bytes, ascii(`${id} 0 obj\n`));
    append(bytes, objects.get(id) ?? []);
    append(bytes, ascii("\nendobj\n"));
  }
  const xref = bytes.length;
  bytes.push(...ascii(`xref\n0 ${count}\n0000000000 65535 f \n`));
  for (let id = 1; id < count; id++) bytes.push(...ascii(`${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`));
  bytes.push(...ascii(`trailer\n<< /Size ${count} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return Uint8Array.from(bytes);
}
