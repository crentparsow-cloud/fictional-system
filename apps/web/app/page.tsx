import { GENRES } from "@akana/schema";
import { brand } from "@/lib/brand";

const GENRE_LABELS: Record<(typeof GENRES)[number], string> = {
  wellbeing: "Wellbeing",
  personal_development: "Personal development",
  relationships: "Relationships",
  parenting: "Parenting",
  career: "Career",
  leadership: "Leadership",
  business: "Business",
  productivity: "Productivity",
  finance: "Finance",
  education: "Education",
  life_skills: "Life skills",
};

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">Day 1 preview. Nothing here is for sale yet.</p>
          <h1>{brand.line}</h1>
          <p>
            Interactive guided workbooks built from published books, licensed from their authors and publishers. Read a
            week, do the exercises, keep your answers private.
          </p>
          <p>
            <a className="btn secondary" href="/publish" style={{ borderColor: "currentColor", color: "inherit" }}>
              Publish with {brand.name}
            </a>
          </p>
        </div>
      </section>

      <section className="wrap" style={{ paddingBlock: "2.5rem" }}>
        <h2>Eleven shelves</h2>
        <p className="muted">The library opens in week 2. These are the genres the catalogue is built around.</p>
        <div className="grid" role="list">
          {GENRES.map((g) => (
            <div className="card" role="listitem" key={g}>
              <strong>{GENRE_LABELS[g]}</strong>
              <p className="muted" style={{ marginBlockStart: "0.4rem", marginBlockEnd: 0 }}>
                {g === "wellbeing" ? "Help now on every screen. Wellness, not treatment." : "Coming with the demo catalogue."}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <div className="wrap">
          <p style={{ marginBlockEnd: "0.4rem" }}>{brand.wellnessNotice}</p>
          <p style={{ marginBlockEnd: 0 }}>No ad pixels. No third-party trackers. Your answers are sealed and only you can read them.</p>
        </div>
      </footer>
    </main>
  );
}
