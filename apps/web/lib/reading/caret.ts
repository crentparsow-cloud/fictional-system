/**
 * Where the writing cursor is on the screen, for typewriter centring (3.11).
 * A hidden copy of the text box carries the same text up to the cursor, and
 * the position of a marker at its end is the cursor's. Browser only.
 */
const COPY = [
  "boxSizing", "width", "overflowX", "overflowY", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize",
  "fontFamily", "lineHeight", "textAlign", "textTransform", "textIndent", "letterSpacing", "wordSpacing", "tabSize", "whiteSpace", "wordBreak", "overflowWrap",
] as const;

export function caretViewportTop(ta: HTMLTextAreaElement): { top: number; lineHeight: number } | null {
  try {
    const style = window.getComputedStyle(ta);
    const mirror = document.createElement("div");
    const ms = mirror.style;
    for (const k of COPY) (ms as unknown as Record<string, string>)[k] = style[k];
    ms.position = "absolute";
    ms.visibility = "hidden";
    ms.whiteSpace = "pre-wrap";
    ms.overflow = "hidden";
    ms.top = "0";
    ms.left = "-9999px";
    mirror.textContent = ta.value.slice(0, ta.selectionStart ?? ta.value.length);
    const marker = document.createElement("span");
    marker.textContent = "​";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const lh = parseFloat(style.lineHeight);
    const lineHeight = Number.isFinite(lh) ? lh : parseFloat(style.fontSize) * 1.4;
    const inner = marker.offsetTop;
    document.body.removeChild(mirror);
    const rect = ta.getBoundingClientRect();
    return { top: rect.top + parseFloat(style.borderTopWidth || "0") + inner - ta.scrollTop, lineHeight };
  } catch {
    return null;
  }
}
