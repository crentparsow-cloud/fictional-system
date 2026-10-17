import type { ReactNode } from "react";
import { ShelfTile } from "@/components/explore/ShelfTile";
import { Confetti } from "@/components/motion/Confetti";
import { ProgrammeReveal } from "@/components/motion/ProgrammeReveal";
import { SaveToast } from "@/components/motion/SaveToast";
import { UnitMap } from "@/components/reader/UnitMap";
import { DIRECTIONS, SHELF_IDS, type DirectionId } from "@/lib/design/directions";
import { COVER_FORMATS } from "@/lib/design/cover-spec";
import { MOTION_MS } from "@/lib/motion";
import type { PathNode } from "@/lib/reading/path";
import messages from "@/messages/en-GB.json";

const SCHEMES = ["light", "dark"] as const;

/** Renders its children once in light and once in dark, side by side, each on its own canvas. */
function Both({ title, note, children }: { title: string; note?: string; children: (scheme: "light" | "dark") => ReactNode }) {
  return (
    <section className="kit-section" aria-labelledby={`kit-${title.replace(/\W+/g, "-").toLowerCase()}`}>
      <h2 id={`kit-${title.replace(/\W+/g, "-").toLowerCase()}`}>{title}</h2>
      {note ? <p className="muted">{note}</p> : null}
      <div className="kit-panes">
        {SCHEMES.map((scheme) => (
          <div key={scheme} className="kit-pane" data-scheme={scheme}>
            <p className="kit-pane-label">{scheme === "light" ? "Light" : "Dark"}</p>
            {children(scheme)}
          </div>
        ))}
      </div>
    </section>
  );
}

const NODES: PathNode[] = [
  { number: 1, focus: "Where you are now", state: "done", stepsDone: 4, stepsTotal: 4 },
  { number: 2, focus: "One small change", state: "today", stepsDone: 1, stepsTotal: 4 },
  { number: 3, focus: "Keeping it going", state: "locked", reason: "ahead", stepsDone: 0, stepsTotal: 4 },
  { number: 4, focus: "Looking back", state: "locked", reason: "paywall", stepsDone: 0, stepsTotal: 4 },
];

const TOKEN_GROUPS: { name: string; tokens: string[] }[] = [
  { name: "Page", tokens: ["canvas", "surface", "surface-2", "line", "line-strong", "ink", "ink-soft"] },
  { name: "Brand (key actions and the logo only)", tokens: ["brand", "brand-ink", "brand-text", "brand-wash", "highlight"] },
  { name: "Meaning", tokens: ["marigold", "rose", "help-bg", "stage-1-t", "stage-2-t", "stage-3-t", "stage-4-t"] },
];

/** Every shared component in its states. Server-renderable, so a test can snapshot it. */
export function KitSections({ direction }: { direction: DirectionId }) {
  const d = DIRECTIONS[direction];
  const shelfName = (id: string) => id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  const shelfLine = (id: string) => (messages as Record<string, string>)[`shelf.line.${id}`] ?? null;
  return (
    <>
      <Both title="Colour tokens" note="Every colour on the site is one of these. The brand colour is for key actions and the logo.">
        {() =>
          TOKEN_GROUPS.map((g) => (
            <div key={g.name} className="kit-group">
              <p className="kit-group-name">{g.name}</p>
              <ul className="kit-swatches">
                {g.tokens.map((t) => (
                  <li key={t}>
                    <i style={{ background: `var(--${t})` }} aria-hidden="true" />
                    <code>--{t}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))
        }
      </Both>

      <Both title="Type" note={`Sans for Akana's voice, serif for content. ${d.sansName} and ${d.serifName} in this direction.`}>
        {() => (
          <div className="kit-type">
            <p className="kit-sans-h">Interface heading in the sans</p>
            <p className="kit-sans">Buttons, prompts and navigation use the sans at 16px.</p>
            <p className="kit-serif-h">Book titles and content in the serif</p>
            <p className="kit-serif">Workbook text is set at the reading size, 20px at step one, on a 65 character line. It grows with the reader&apos;s text setting.</p>
            <p className="kit-serif"><em>Quotes and book titles are in italic.</em></p>
          </div>
        )}
      </Both>

      <Both title="Buttons" note="Default, secondary, help, disabled and keyboard focus.">
        {() => (
          <div className="kit-row">
            <a className="btn" href="#kit">Primary</a>
            <a className="btn secondary" href="#kit">Secondary</a>
            <a className="btn help" href="#kit">Get help now</a>
            <button type="button" className="btn" disabled>Disabled</button>
            <a className="btn kit-focus" href="#kit">Focus</a>
          </div>
        )}
      </Both>

      <Both title="Badges and cards">
        {() => (
          <div className="kit-stack">
            <div className="kit-row">
              <span className="badge">Included</span>
              <span className="badge demo">Demo</span>
            </div>
            <div className="card"><p>A plain card on the surface colour.</p></div>
            <a className="card lift" href="#kit"><p>A card that lifts on hover and focus.</p></a>
          </div>
        )}
      </Both>

      <Both title="Form fields" note="Default, focus, error and disabled.">
        {() => (
          <form className="kit-stack" aria-label="Sample fields">
            <label className="kit-field">Default<input className="ak-input" defaultValue="Some words" /></label>
            <label className="kit-field">Focus<input className="ak-input kit-focus" defaultValue="Some words" /></label>
            <label className="kit-field">Error<input className="ak-input" aria-invalid="true" defaultValue="" /><span className="kit-error">Say a little more.</span></label>
            <label className="kit-field">Disabled<input className="ak-input" disabled defaultValue="Not editable" /></label>
            <label className="kit-field">Longer answer<textarea className="ak-textarea" rows={3} defaultValue="A longer answer in the reading serif." /></label>
          </form>
        )}
      </Both>

      <Both title="Shelves" note="Ten shelves, each with a colour, an icon and a line.">
        {() => (
          <div className="kit-tiles">
            {SHELF_IDS.map((id) => (
              <ShelfTile key={id} id={id} name={shelfName(id)} line={shelfLine(id)} countLabel="12 titles" />
            ))}
          </div>
        )}
      </Both>

      <Both title="Covers" note="Format-coded: one, two or three bars for 4, 8 and 12 weeks, a collection mark, a Start here mark. One line of preview on every cover.">
        {(scheme) => (
          <div className="kit-covers">
            {COVER_FORMATS.map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f} src={`/dev/kit/cover?direction=${direction}&format=${f}&shelf=${SHELF_IDS[COVER_FORMATS.indexOf(f) * 2]}&scheme=${scheme}&w=240`} width={120} height={160} alt={`Sample ${f} cover`} loading="lazy" />
            ))}
          </div>
        )}
      </Both>

      <Both title="Path through a workbook" note="Done, today and not open yet; then the compact strip.">
        {() => (
          <div className="kit-stack">
            <UnitMap nodes={NODES} word="week" slug="sample" />
            <UnitMap nodes={NODES} word="week" slug="sample" compact />
          </div>
        )}
      </Both>

      <Both title="Saving and finishing" note="The two-word toast, one burst of confetti at unit end, and the larger reveal at programme end.">
        {() => (
          <div className="kit-stack">
            <SaveToast state="saved" inline />
            <SaveToast state="failed" inline />
            <div className="kit-confetti"><Confetti /><p className="muted">Unit end</p></div>
            <ProgrammeReveal title="You finished." line="Twelve weeks, one step at a time." />
          </div>
        )}
      </Both>

      <section className="kit-section" aria-labelledby="kit-motion">
        <h2 id="kit-motion">Motion</h2>
        <p className="muted">Durations are tokens. Reduced motion removes all movement; the words stay.</p>
        <table className="kit-table">
          <tbody>
            {Object.entries(MOTION_MS).map(([k, v]) => (
              <tr key={k}>
                <th scope="row"><code>--dur-{k}</code></th>
                <td>{v} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
