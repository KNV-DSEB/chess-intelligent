import Link from 'next/link';

import { ChessPosition } from './components/chess-position';
import { RootSessionRedirect } from './root-session-redirect';

const previewFen = 'r1bq1rk1/ppp2ppp/2np1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQR1K1 w - - 4 9';

export default function HomePage() {
  return (
    <>
      <RootSessionRedirect />
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-promise">
          <p className="landing-trust">For chess academies that coach from the board</p>
          <h1 id="landing-title">Turn played games into precise next lessons.</h1>
          <p className="landing-lede">
            Chess Intelligent connects real games, exact position evidence, and focused training so
            coaches can see what happened and decide what to teach next.
          </p>
          <div className="mobile-evidence-cue" aria-label="Example evidence path">
            <strong>18. Bg5</strong>
            <span>Exact game · concept evidence · next lesson</span>
          </div>
          <div className="landing-actions">
            <Link className="button-link landing-primary" href="/signup">
              Start an academy
            </Link>
            <Link className="landing-secondary" href="/login">
              Sign in
            </Link>
          </div>
          <p className="landing-assurance">Your first account creates no Student or Player data.</p>
        </div>

        <div className="dossier-preview" aria-label="Illustrative product view">
          <div className="dossier-caption">
            <span>Illustrative product view</span>
            <strong>Game review · Sofia Marin</strong>
          </div>
          <div className="dossier-body">
            <div className="dossier-board">
              <ChessPosition fen={previewFen} sideToMove="WHITE" compact />
              <p>
                <span>Position 18</span>
                White to move after 17…Nf6
              </p>
            </div>
            <div className="evidence-ledger">
              <div className="evidence-trace active">
                <span>Observed decision</span>
                <strong>18. Bg5</strong>
                <small>Exact game occurrence</small>
              </div>
              <div className="evidence-trace">
                <span>Coach evidence</span>
                <strong>Candidate moves</strong>
                <small>Engine-backed · concept classified</small>
              </div>
              <div className="evidence-trace">
                <span>Next action</span>
                <strong>Compare 18. Bg5 and 18. h3</strong>
                <small>Focused training assignment</small>
              </div>
            </div>
          </div>
          <div className="dossier-note">
            <span aria-hidden="true">↳</span>
            <p>Every conclusion keeps a path back to the game and position that supports it.</p>
          </div>
        </div>
      </section>

      <section className="landing-loop" id="how-it-works" aria-labelledby="loop-title">
        <div className="landing-section-copy">
          <h2 id="loop-title">A coaching loop grounded in evidence.</h2>
          <p>
            No mystery score, no generic puzzle feed. Each step preserves what is known and leaves
            missing evidence unknown.
          </p>
        </div>
        <ol className="loop-ledger">
          <li>
            <strong>Bring the games</strong>
            <span>
              Import a Student’s real over-the-board history with source provenance intact.
            </span>
          </li>
          <li>
            <strong>Review the decisions</strong>
            <span>
              Move from game to exact position, concept evidence, and compatible analysis.
            </span>
          </li>
          <li>
            <strong>Assign the next task</strong>
            <span>Turn supported learning priorities into focused, measurable training.</span>
          </li>
        </ol>
      </section>

      <section className="landing-roles" aria-labelledby="roles-title">
        <div>
          <h2 id="roles-title">Serious enough for a coach. Clear enough for a Student.</h2>
          <p>
            Coaches get the lineage and denominators behind every learning view. Students get a
            calm, focused view of today’s assignment—without implementation language.
          </p>
        </div>
        <div className="role-proof">
          <blockquote>“Show me the position, the evidence, and the action I can take.”</blockquote>
          <p>That is the product contract.</p>
        </div>
      </section>

      <section className="landing-trust-section" aria-labelledby="trust-title">
        <h2 id="trust-title">Built around chess truth, not generated certainty.</h2>
        <div>
          <p>Historical play and engine analysis stay separate.</p>
          <p>Unknown evidence never becomes a weakness label.</p>
          <p>Training decisions remain traceable to exact games and positions.</p>
        </div>
      </section>

      <section className="landing-final">
        <div>
          <h2>Open the academy. Bring the first game.</h2>
          <p>
            Create the Owner account now; invite Coaches and Students when the Academy is ready.
          </p>
        </div>
        <Link className="button-link landing-primary" href="/signup">
          Start an academy
        </Link>
      </section>

      <footer className="landing-footer">
        <span>Chess Intelligent</span>
        <Link href="/login">Sign in</Link>
      </footer>
    </>
  );
}
