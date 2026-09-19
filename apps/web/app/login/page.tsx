'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';

import { apiUrl } from '../api-client';
import { safeReturnTo, withReturnTo } from '../safe-navigation';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [returnTo, setReturnTo] = useState('/my');

  useEffect(() => {
    setHydrated(true);
    setReturnTo(safeReturnTo(new URLSearchParams(window.location.search).get('returnTo')));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      if (response.ok) {
        window.location.assign(returnTo);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      setError(body.error?.message ?? 'Sign-in failed.');
    } catch {
      setError('The sign-in service could not be reached. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-shell entry-auth-shell">
      <div className="auth-story">
        <div className="auth-dossier">
          <span>Game</span>
          <strong>12…Nf6</strong>
          <span>Pattern</span>
          <strong>Piece activity</strong>
          <span>Next</span>
          <strong>One focused exercise</strong>
        </div>
        <blockquote>
          Every training decision should lead back to a position on the board.
        </blockquote>
      </div>
      <div className="panel auth-panel">
        <h1>Welcome back</h1>
        <p>Sign in to continue your academy work.</p>
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
            <span className="password-field">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
              />
              <button
                className="password-toggle"
                type="button"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          <button disabled={loading || !hydrated}>
            {!hydrated ? 'Preparing secure sign-in…' : loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="auth-switch">
          <Link href="/password-reset">Forgot your password?</Link>
        </p>
        <p className="auth-switch">
          New to Chess Intelligent?{' '}
          <Link href={withReturnTo('/signup', returnTo)}>Create an account</Link>
        </p>
      </div>
    </section>
  );
}
