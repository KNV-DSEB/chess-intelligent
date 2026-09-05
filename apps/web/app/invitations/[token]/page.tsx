'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface Invitation {
  academyName: string;
  normalizedEmail: string;
  role: string;
  status: string;
  expiresAt: string;
}

export default function InvitationPage() {
  const parameters = useParams<{ token: string }>();
  const token = parameters.token;
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    void fetch(`${apiUrl}/auth/invitations/${encodeURIComponent(token)}`, {
      credentials: 'include',
    })
      .then(async (response) => {
        const body = (await response.json()) as Invitation & { error?: { message?: string } };
        if (!response.ok) throw new Error(body.error?.message ?? 'Invitation is unavailable.');
        setInvitation(body);
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Invitation is unavailable.'),
      );
  }, [token]);

  async function accept(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${apiUrl}/auth/invitations/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        displayName: form.get('displayName'),
        password: form.get('password'),
      }),
    });
    const body = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setError(body.error?.message ?? 'Invitation could not be accepted.');
      return;
    }
    setAccepted(true);
  }

  return (
    <section className="panel auth-panel">
      <p className="eyebrow">Academy invitation</p>
      <h1>{invitation ? `Join ${invitation.academyName}` : 'Invitation'}</h1>
      {invitation ? (
        <p>
          Role: <b>{invitation.role}</b> · expires {new Date(invitation.expiresAt).toLocaleString()}
        </p>
      ) : null}
      {accepted ? (
        <p>
          Account ready. <a href="/login">Sign in to continue.</a>
        </p>
      ) : invitation ? (
        <form className="stacked-form" onSubmit={(event) => void accept(event)}>
          <label>
            Email
            <input name="email" type="email" defaultValue={invitation.normalizedEmail} required />
          </label>
          <label>
            Display name
            <input name="displayName" required />
          </label>
          <label>
            Password (12+ characters)
            <input
              name="password"
              type="password"
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>
          <button>Accept invitation</button>
        </form>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
