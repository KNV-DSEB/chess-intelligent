'use client';

import { useParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { apiUrl } from '../../api-client';

export default function PasswordResetCompletePage() {
  const token = useParams<{ token: string }>().token;
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get('newPassword') ?? '');
    if (newPassword !== form.get('confirmation')) {
      setError('The password confirmation does not match.');
      return;
    }
    const response = await fetch(`${apiUrl}/auth/password-reset/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const body = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setError(body.error?.message ?? 'The reset link could not be used.');
      return;
    }
    setCompleted(true);
  }

  return (
    <section className="panel auth-panel">
      <p className="eyebrow">Account recovery</p>
      <h1>Choose a new password</h1>
      {completed ? (
        <p>
          Password changed and old sessions revoked. <a href="/login">Sign in again.</a>
        </p>
      ) : (
        <form className="stacked-form" onSubmit={(event) => void submit(event)}>
          <label>
            New password (12+ characters)
            <input
              name="newPassword"
              type="password"
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              name="confirmation"
              type="password"
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>
          <button>Reset password</button>
        </form>
      )}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
