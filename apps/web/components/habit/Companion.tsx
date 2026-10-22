import type { CompanionView } from "@/lib/habit/server";

/**
 * The companion on Today (4.6): a small plant that grows with finished steps.
 * It only ever grows. One line or question under it, no numbers to protect,
 * nothing that fades. Drawn in SVG so it needs no image file.
 */

function Plant({ stage }: { stage: number }) {
  const height = 14 + stage * 9;
  const leaves = Math.min(stage, 6);
  const top = 70 - height;
  return (
    <svg className="companion-art" viewBox="0 0 80 80" width="72" height="72" role="img" aria-label={`A plant at stage ${stage + 1}`}>
      <ellipse cx="40" cy="73" rx="22" ry="4" className="companion-soil" />
      {stage === 0 ? (
        <ellipse cx="40" cy="68" rx="5" ry="3.5" className="companion-seed" />
      ) : (
        <>
          <path d={`M40 70 C40 ${top + height / 2} 40 ${top + height / 3} 40 ${top}`} className="companion-stem" fill="none" strokeWidth="3" strokeLinecap="round" />
          {Array.from({ length: leaves }, (_, i) => {
            const y = 66 - i * ((height - 6) / Math.max(leaves, 1));
            const dir = i % 2 === 0 ? -1 : 1;
            return <path key={i} d={`M40 ${y} q${dir * 14} -6 ${dir * 16} -${12 + (i % 3) * 2} q${dir * -12} 0 ${dir * -16} ${12 + (i % 3) * 2}z`} className="companion-leaf" />;
          })}
        </>
      )}
    </svg>
  );
}

export function Companion({ view }: { view: CompanionView }) {
  return (
    <section className="card companion" aria-labelledby="companion-h" data-testid="companion">
      <Plant stage={view.stage.stage} />
      <div className="companion-text">
        <h2 id="companion-h" className="small muted">
          Your companion
        </h2>
        <p className="companion-words">{view.words.text}</p>
        <p className="small muted">{view.growth}</p>
      </div>
    </section>
  );
}
