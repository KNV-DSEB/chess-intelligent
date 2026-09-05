'use client';

import { type FormEvent, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export default function PasswordResetRequestPage() {
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${apiUrl}/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: form.get('email') }),
    });
    if (!response.ok) {
      setError('The reset request could not be processed. Try again later.');
      return;
    }
    setAccepted(true);
  }

  return (
    <section className="panel auth-panel">
      <p className="eyebrow">Account recovery</p>
      <h1>Reset password</h1>
      {accepted ? (
        <p>If an active account matches that email, a single-use reset link has been requested.</p>
      ) : (
        <form className="stacked-form" onSubmit={(event) => void submit(event)}>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <button>Request reset link</button>
        </form>
      )}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
