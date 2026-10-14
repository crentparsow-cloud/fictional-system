import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { KitSections } from "@/components/kit/KitSections";
import { DIRECTION_IDS } from "./directions";

/**
 * Snapshot of the /dev/kit sections (plan 1.7). A change to a shared component's
 * markup, a state the kit stops showing, or a missing light or dark pane shows up here.
 */
describe("/dev/kit rendering", () => {
  const html = renderToStaticMarkup(createElement(KitSections, { direction: "paper-and-ink" }));

  it("matches the snapshot", () => {
    expect(html).toMatchSnapshot();
  });

  it("shows every section in a light and a dark pane", () => {
    const sections = html.match(/<section class="kit-section"/g)?.length ?? 0;
    expect(html.match(/data-scheme="light"/g)?.length).toBe(html.match(/data-scheme="dark"/g)?.length);
    expect(html.match(/data-scheme="light"/g)?.length).toBeGreaterThanOrEqual(sections - 1);
  });

  it("shows all ten shelves, all five cover formats and every button state", () => {
    expect(html.match(/class="shelf-tile"/g)?.length).toBe(20);
    for (const f of ["w4", "w8", "w12", "collection", "start"]) expect(html).toContain(`format=${f}&amp;`);
    for (const s of ["btn secondary", "btn help", "disabled", "kit-focus"]) expect(html).toContain(s);
  });

  it("asks for covers in the chosen direction", () => {
    for (const id of DIRECTION_IDS) expect(renderToStaticMarkup(createElement(KitSections, { direction: id }))).toContain(`direction=${id}&amp;`);
  });
});
