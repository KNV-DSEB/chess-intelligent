'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiUrl } from '../api-client';

interface User {
  displayName: string | null;
  email: string;
  memberships: Array<{
    id: string;
    academyId: string;
    academyName: string;
    role: 'OWNER' | 'ADMIN' | 'COACH' | 'STUDENT';
    status: string;
    consentStatus: string | null;
  }>;
}

export default function MyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetch(`${apiUrl}/auth/me`, { credentials: 'include' })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign('/login');
          return null;
        }
        return (await response.json()) as User;
      })
      .then(setUser)
      .catch(() => setError('Could not load the authenticated account.'));
  }, []);

  const activeMemberships =
    user?.memberships.filter((membership) => membership.status === 'ACTIVE') ?? [];

  return (
    <section className="panel wide">
      <p className="context-line">My Academies</p>
      <h1>{user?.displayName ?? user?.email ?? 'My Academies'}</h1>
      {error ? <p className="error">{error}</p> : null}
      {user && activeMemberships.length === 0 ? (
        <div className="account-empty-state">
          <h2>Your account is ready. Your Academy is next.</h2>
          <p>
            Create a new Academy as Owner, or use the exact invitation sent by an existing Academy.
          </p>
          <Link className="button-link" href="/onboarding">
            Continue setup
          </Link>
        </div>
      ) : null}
      <div className="academy-roster">
        {activeMemberships.map((membership) => (
          <article className="academy-student-card" key={membership.id}>
            <h2>{membership.academyName}</h2>
            <p>{membership.role}</p>
            {membership.role === 'STUDENT' ? (
              <>
                <p>Student access: {membership.consentStatus}</p>
                <a className="button-link" href={`/academy/${membership.academyId}/my`}>
                  My assignments and intelligence
                </a>
              </>
            ) : (
              <a className="button-link" href={`/academy?academyId=${membership.academyId}`}>
                Open Academy
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
