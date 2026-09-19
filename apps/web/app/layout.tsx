import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import './styles.css';
import { SessionNavigation } from './session-navigation';

export const metadata: Metadata = {
  title: 'Chess Intelligent',
  description: 'Evidence-grounded chess learning intelligence for academies.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <header className="site-header">
          <Link className="site-brand" href="/">
            <span className="site-brand-mark" aria-hidden="true">
              CI
            </span>
            <span className="site-brand-copy">
              <strong>Chess Intelligent</strong>
              <small>Evidence-led coaching</small>
            </span>
          </Link>
          <nav aria-label="Primary navigation">
            <SessionNavigation />
          </nav>
        </header>
        <main id="main-content">{children}</main>
      </body>
    </html>
  );
}
