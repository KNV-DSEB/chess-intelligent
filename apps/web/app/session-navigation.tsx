'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiUrl } from './api-client';

interface SessionUser {
  displayName: string | null;
  email: string;
  memberships: Array<{
    academyId: string;
    role: 'OWNER' | 'ADMIN' | 'COACH' | 'STUDENT';
    status: string;
  }>;
}

export function SessionNavigation() {
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [logoutFailed, setLogoutFailed] = useState(false);

  useEffect(() => {
    void fetch(`${apiUrl}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? ((await response.json()) as SessionUser) : null))
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  async function logout(): Promise<void> {
    setLogoutFailed(false);
    const response = await fetch(`${apiUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) {
      setLogoutFailed(true);
      return;
    }
    setUser(null);
    window.location.assign('/login');
  }

  if (user === undefined)
    return <span className="session-status nav-loading">Checking session…</span>;
  if (!user)
    return (
      <div className="public-navigation">
        <Link href="/#how-it-works">How it works</Link>
        <Link href="/login">Sign in</Link>
        <Link className="header-cta" href="/signup">
          Start an academy
        </Link>
      </div>
    );
  const activeMemberships = user.memberships.filter((membership) => membership.status === 'ACTIVE');
  const operationalMembership = activeMemberships.find((membership) =>
    ['OWNER', 'ADMIN', 'COACH'].includes(membership.role),
  );
  const studentMembership = activeMemberships.find((membership) => membership.role === 'STUDENT');
  const studentScopeAcademyId = /^\/academy\/([^/]+)\/my$/u.exec(pathname)?.[1] ?? null;
  const studentScopeMembership = activeMemberships.find(
    (membership) => membership.role === 'STUDENT' && membership.academyId === studentScopeAcademyId,
  );
  const visibleStudentMembership = studentScopeMembership ?? studentMembership;
  const operationalHome = operationalMembership
    ? `/academy?academyId=${operationalMembership.academyId}`
    : '/academy';
  const studentHome = visibleStudentMembership
    ? `/academy/${visibleStudentMembership.academyId}/my`
    : '/my';
  return (
    <div className="session-navigation">
      {activeMemberships.length === 0 ? (
        <div className="role-navigation" aria-label="Account setup">
          <Link href="/onboarding">Create or join an Academy</Link>
        </div>
      ) : null}
      {operationalMembership && !studentScopeMembership ? (
        <div className="role-navigation" aria-label="Coach workspace">
          <Link href={`${operationalHome}#coach-home`}>Home</Link>
          <Link href={`${operationalHome}#students`}>Students</Link>
          <Link href={`${operationalHome}#training`}>Training</Link>
          <Link href={`${operationalHome}#progress`}>Progress</Link>
          <details className="utility-menu">
            <summary>Academy tools</summary>
            <div>
              <Link href="/preparation">Opponent preparation</Link>
              <Link href="/import">Game import</Link>
              <Link href="/ontology">Concept library</Link>
              <Link href="/coverage">System coverage</Link>
            </div>
          </details>
        </div>
      ) : null}
      {visibleStudentMembership ? (
        <div className="role-navigation" aria-label="Student workspace">
          <Link href={`${studentHome}#today`}>Today</Link>
          <Link href={`${studentHome}#training`}>Training</Link>
          <Link href={`${studentHome}#progress`}>Progress</Link>
        </div>
      ) : null}
      <span className="session-status">
        <Link href="/my">{user.displayName ?? user.email}</Link>
        <button className="link-button" type="button" onClick={() => void logout()}>
          Sign out
        </button>
        {logoutFailed ? <span role="alert">Sign out failed. Try again.</span> : null}
      </span>
    </div>
  );
}
