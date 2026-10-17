"use client";

import { useEffect } from "react";

/**
 * Chrome that gets out of the way while reading (item 7). On a unit screen
 * the page chrome (save line, path, tab bar) slides away once the reader
 * scrolls down, and comes back on a scroll up, a mouse near the top, any key
 * press or focus, or a tap. It sets data-chrome="hidden" on <html>; the CSS
 * does the rest, and does nothing under reduced motion beyond hiding.
 */
export function useReadingChrome(active: boolean): void {
  useEffect(() => {
    const html = document.documentElement;
    if (!active) {
      html.removeAttribute("data-chrome");
      return;
    }
    let lastY = window.scrollY;
    const show = () => html.removeAttribute("data-chrome");
    const hide = () => html.setAttribute("data-chrome", "hidden");
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastY + 12 && y > 160) hide();
      else if (y < lastY - 12 || y < 40) show();
      lastY = y;
    };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && (e.clientY < 90 || e.clientY > window.innerHeight - 90)) show();
    };
    const onTap = (e: MouseEvent) => {
      if (html.getAttribute("data-chrome") === "hidden" && !(e.target as HTMLElement).closest("a,button,input,textarea,select,label,summary")) show();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("keydown", show);
    window.addEventListener("focusin", show);
    window.addEventListener("click", onTap);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("keydown", show);
      window.removeEventListener("focusin", show);
      window.removeEventListener("click", onTap);
      html.removeAttribute("data-chrome");
    };
  }, [active]);
}
