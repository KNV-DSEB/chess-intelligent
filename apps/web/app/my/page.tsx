'use client';

import { useEffect, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

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

  return (
    <section className="panel wide">
      <p className="eyebrow">Authenticated workspace</p>
      <h1>{user?.displayName ?? user?.email ?? 'My Academies'}</h1>
      {error ? <p className="error">{error}</p> : null}
      <div className="academy-roster">
        {user?.memberships
          .filter((membership) => membership.status === 'ACTIVE')
          .map((membership) => (
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
