'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';

import { apiUrl } from '../api-client';

interface User {
  displayName: string | null;
  email: string;
  memberships: Array<{
    id: string;
    academyId: string;
    academyName: string;
    role: string;
    status: string;
  }>;
}

interface AcademyCreation {
  academy: { id: string; name: string };
  membership: { id: string; role: 'OWNER' };
}

export default function OnboardingPage() {
  const [user, setUser] = useState<User | null>(null);
  const [created, setCreated] = useState<AcademyCreation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState('');

  useEffect(() => {
    void fetch(`${apiUrl}/auth/me`, { credentials: 'include' })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.replace('/login?returnTo=%2Fonboarding');
          return null;
        }
        return (await response.json()) as User;
      })
      .then(setUser)
      .catch(() => setError('Your account could not be loaded. Refresh and try again.'));
  }, []);

  async function createAcademy(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${apiUrl}/academies`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: data.get('name') }),
      });
      const body = (await response.json().catch(() => ({}))) as AcademyCreation & {
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(body.error?.message ?? 'The Academy could not be created.');
        return;
      }
      if (!body.academy?.id || !body.academy.name || body.membership?.role !== 'OWNER') {
        throw new Error('Unexpected Academy response.');
      }
      setCreated(body);
    } catch {
      setError('The Academy service could not be reached. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function openInvitation(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    try {
      const url = new URL(inviteLink, window.location.origin);
      const match = /^\/invitations\/([^/]+)$/u.exec(url.pathname);
      if (url.origin !== window.location.origin || !match) throw new Error();
      window.location.assign(url.pathname);
    } catch {
      setError('Paste a valid Chess Intelligent invitation link.');
    }
  }

  if (created) {
    return (
      <section className="onboarding-shell onboarding-success">
        <p className="context-line">Academy created</p>
        <h1>{created.academy.name} is ready.</h1>
        <p>
          You are the Owner. No Student, Player, game, or learning evidence was created on your
          behalf.
        </p>
        <div className="onboarding-next-actions">
          <Link
            className="button-link"
            href={`/academy?academyId=${created.academy.id}#academy-administration`}
          >
            Invite your first Coach or Student
          </Link>
          <Link className="secondary-button" href={`/academy?academyId=${created.academy.id}`}>
            Explore Academy Home
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="onboarding-shell">
      <header>
        <p className="context-line">Account ready</p>
        <h1>Where will you coach?</h1>
        <p>
          Create a new Academy as its Owner, or join an existing one through the exact invitation
          your Academy sent you. Roles are never self-selected.
        </p>
      </header>

      {user?.memberships.some((membership) => membership.status === 'ACTIVE') ? (
        <div className="existing-memberships">
          <p>You already belong to an Academy.</p>
          <Link href="/my">Open My Academies</Link>
        </div>
      ) : null}

      <div className="onboarding-paths">
        <form
          className="onboarding-path primary-path"
          onSubmit={(event) => void createAcademy(event)}
        >
          <h2>Create an Academy</h2>
          <p>You become Owner of this new Academy only.</p>
          <label>
            Academy name
            <input name="name" maxLength={300} autoComplete="organization" required />
          </label>
          <button disabled={loading}>{loading ? 'Creating Academy…' : 'Create Academy'}</button>
        </form>

        <form className="onboarding-path" onSubmit={openInvitation}>
          <h2>Join with an invitation</h2>
          <p>
            Your invitation carries the Academy and role. There is no Academy code or role picker.
          </p>
          <label>
            Invitation link
            <input
              type="url"
              value={inviteLink}
              onChange={(event) => setInviteLink(event.target.value)}
              placeholder="https://…/invitations/…"
              required
            />
          </label>
          <button className="secondary-button">Open invitation</button>
        </form>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
