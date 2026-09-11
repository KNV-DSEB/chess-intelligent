import type { Metadata } from 'next';
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
        <header className="site-header">
          <a className="site-brand" href="/">
            <span aria-hidden="true">CI</span>
            Chess Intelligent
          </a>
          <nav aria-label="Primary navigation">
            <SessionNavigation />
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
