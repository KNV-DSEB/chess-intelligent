'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

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

  if (user === undefined) return <span className="session-status">Checking session…</span>;
  if (!user) return <a href="/login">Sign in</a>;
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
  return (
    <>
      {operationalMembership && !studentScopeMembership ? (
        <>
          <a href="/academy">Academy</a>
          <a href="/training">Training</a>
          <a href="/intelligence/skills">Skill Map</a>
          <a href="/preparation">Opponent prep</a>
          <a href="/import">Import</a>
          <a href="/ontology">Ontology</a>
          <a href="/coverage">Coverage</a>
        </>
      ) : null}
      {visibleStudentMembership ? (
        <a href={`/academy/${visibleStudentMembership.academyId}/my`}>My training</a>
      ) : null}
      <span className="session-status">
        <a href="/my">{user.displayName ?? user.email}</a>
        <button className="link-button" type="button" onClick={() => void logout()}>
          Sign out
        </button>
        {logoutFailed ? <span role="alert">Sign out failed. Try again.</span> : null}
      </span>
    </>
  );
}
