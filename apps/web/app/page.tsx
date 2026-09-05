export default function HomePage() {
  return (
    <section className="panel">
      <p className="eyebrow">Academy-first chess intelligence</p>
      <h1>Prepare from stored evidence, not move prophecy.</h1>
      <p>
        Import provenance-preserving games, traverse observed repertoire by exact player identity,
        and inspect preparation candidates with opponent, strong-reference, and compatible engine
        evidence kept separate.
      </p>
      <div className="home-actions">
        <a className="button-link" href="/academy">
          Open academy workflow
        </a>
        <a className="button-link" href="/training">
          Open adaptive training
        </a>
        <a className="button-link" href="/intelligence/skills">
          Build a Player Skill Graph
        </a>
        <a className="button-link" href="/ontology">
          Explore the concept ontology
        </a>
        <a className="button-link" href="/intelligence/player">
          Build a player dossier
        </a>
        <a className="button-link" href="/preparation">
          Open opponent preparation
        </a>
        <a href="/explorer">Explore the historical corpus</a>
      </div>
    </section>
  );
}
