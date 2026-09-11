'use client';

import { type FormEvent, useEffect, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    });
    if (response.ok) {
      window.location.assign('/my');
      return;
    }
    const body = (await response.json()) as { error?: { message?: string } };
    setError(body.error?.message ?? 'Sign-in failed.');
    setLoading(false);
  }

  return (
    <section className="panel auth-panel">
      <p className="eyebrow">Secure Academy access</p>
      <h1>Sign in</h1>
      <p>Use the account created through your Academy invitation.</p>
      <form
        className="stacked-form"
        method="post"
        data-hydrated={hydrated ? 'true' : 'false'}
        onSubmit={(event) => void submit(event)}
      >
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button disabled={loading || !hydrated}>
          {!hydrated ? 'Preparing secure sign-in…' : loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      <p>
        <a href="/password-reset">Forgot your password?</a>
      </p>
    </section>
  );
}
