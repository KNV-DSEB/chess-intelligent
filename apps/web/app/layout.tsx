import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './styles.css';

export const metadata: Metadata = {
  title: 'Chess Intelligent',
  description: 'PGN ingestion developer interface',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a href="/">Chess Intelligent</a>
          <nav>
            <a href="/ontology">Concept ontology</a> <a href="/intelligence/skills">Skill Graph</a>{' '}
            <a href="/intelligence/player">Player Intelligence</a>{' '}
            <a href="/preparation">Opponent preparation</a>{' '}
            <a href="/explorer">Position explorer</a> <a href="/import">Import PGN</a>{' '}
            <a href="/games/new-metadata">New OTB metadata</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
