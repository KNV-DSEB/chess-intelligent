'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

import { apiUrl } from '../../api-client';

type AcademyRole = 'OWNER' | 'ADMIN' | 'COACH' | 'STUDENT';

interface Invitation {
  academyId: string;
  academyName: string;
  normalizedEmail: string;
  role: AcademyRole;
  status: string;
  expiresAt: string;
}

interface SessionUser {
  displayName: string | null;
  email: string;
}

export default function InvitationPage() {
  const token = useParams<{ token: string }>().token;
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetch(`${apiUrl}/auth/invitations/${encodeURIComponent(token)}`, {
        credentials: 'include',
      }).then(async (response) => {
        const body = (await response.json()) as Invitation & { error?: { message?: string } };
        if (!response.ok) throw new Error(body.error?.message ?? 'Invitation is unavailable.');
        return body;
      }),
      fetch(`${apiUrl}/auth/me`, { credentials: 'include' }).then(async (response) =>
        response.ok ? ((await response.json()) as SessionUser) : null,
      ),
    ])
      .then(([nextInvitation, nextUser]) => {
        setInvitation(nextInvitation);
        setUser(nextUser);
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Invitation is unavailable.'),
      );
  }, [token]);

  async function accept(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!invitation) return;
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = user
      ? { displayName: user.displayName ?? user.email }
      : {
          email: invitation.normalizedEmail,
          displayName: form.get('displayName'),
          password: form.get('password'),
        };
    try {
      const response = await fetch(
        `${apiUrl}/auth/invitations/${encodeURIComponent(token)}/accept`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!response.ok) {
        setError(body.error?.message ?? 'Invitation could not be accepted.');
        return;
      }
      window.location.assign(
        invitation.role === 'STUDENT'
          ? `/academy/${invitation.academyId}/my`
          : `/academy?academyId=${invitation.academyId}`,
      );
    } catch {
      setError('The invitation service could not be reached. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="invitation-shell">
      <div className="invitation-letter">
        <p className="context-line">Academy invitation</p>
        <h1>{invitation ? `Join ${invitation.academyName}` : 'Opening invitation…'}</h1>
        {invitation ? (
          <>
            <p>
              This invitation assigns the <strong>{invitation.role.toLowerCase()}</strong> role. You
              cannot change the Academy or role during acceptance.
            </p>
            <dl className="invitation-facts">
              <div>
                <dt>Academy</dt>
                <dd>{invitation.academyName}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{invitation.role}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{invitation.normalizedEmail}</dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>{new Date(invitation.expiresAt).toLocaleDateString()}</dd>
              </div>
            </dl>
          </>
        ) : null}
      </div>

      {invitation && user !== undefined ? (
        <form className="panel auth-panel stacked-form" onSubmit={(event) => void accept(event)}>
          {user ? (
            <>
              <h2>Accept while signed in</h2>
              <p>
                Signed in as <strong>{user.email}</strong>. It must match the invitation email.
              </p>
            </>
          ) : (
            <>
              <h2>Create your invited account</h2>
              <p>Your role comes only from this invitation.</p>
              <label>
                Name
                <input name="displayName" autoComplete="name" maxLength={300} required />
              </label>
              <label>
                Email
                <input value={invitation.normalizedEmail} type="email" disabled />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={256}
                  autoComplete="new-password"
                  required
                />
                <small>Use at least 12 characters.</small>
              </label>
            </>
          )}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button disabled={loading}>
            {loading ? 'Accepting invitation…' : `Join as ${invitation.role.toLowerCase()}`}
          </button>
          {!user ? (
            <p className="auth-switch">
              Already have an account?{' '}
              <Link href={`/login?returnTo=${encodeURIComponent(`/invitations/${token}`)}`}>
                Sign in first
              </Link>
            </p>
          ) : null}
        </form>
      ) : null}
      {error && !invitation ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
