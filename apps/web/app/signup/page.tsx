'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';

import { apiUrl } from '../api-client';
import { safeReturnTo, withReturnTo } from '../safe-navigation';

interface ApiError {
  error?: { code?: string; message?: string; details?: Record<string, string[]> };
}

const signupFields = ['displayName', 'email', 'password', 'confirmation'] as const;

function focusFirstInvalidField(errors: Record<string, string>): void {
  const first = signupFields.find((field) => errors[field]);
  if (first) requestAnimationFrame(() => document.getElementById(`signup-${first}`)?.focus());
}

export default function SignupPage() {
  const [returnTo, setReturnTo] = useState('/onboarding');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setReturnTo(
      safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'), '/onboarding'),
    );
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    const confirmation = String(data.get('confirmation') ?? '');
    const nextErrors: Record<string, string> = {};
    if (password.length < 12) nextErrors.password = 'Use at least 12 characters.';
    if (password !== confirmation) nextErrors.confirmation = 'Passwords do not match.';
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      focusFirstInvalidField(nextErrors);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/auth/signup`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: data.get('displayName'),
          email: data.get('email'),
          password,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as ApiError;
      if (!response.ok) {
        setError(body.error?.message ?? 'Your account could not be created.');
        const details = body.error?.details ?? {};
        const nextFieldErrors = Object.fromEntries(
          Object.entries(details)
            .filter(([, messages]) => messages?.[0])
            .map(([field, messages]) => [field, messages[0]!]),
        );
        setFieldErrors(nextFieldErrors);
        focusFirstInvalidField(nextFieldErrors);
        return;
      }
      window.location.assign(returnTo);
    } catch {
      setError('The account service could not be reached. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-shell entry-auth-shell">
      <div className="auth-story">
        <div className="auth-dossier">
          <span>Account</span>
          <strong>Your secure sign-in</strong>
          <span>Next</span>
          <strong>Create or join an Academy</strong>
          <span>Roles</span>
          <strong>Assigned by ownership or invitation</strong>
        </div>
        <blockquote>Your account stays separate from Student and Player identity.</blockquote>
      </div>
      <div className="panel auth-panel">
        <h1>Create your account</h1>
        <p>Start an Academy or accept an invitation after this secure account is ready.</p>
        <form className="stacked-form" onSubmit={(event) => void submit(event)} noValidate>
          <label>
            Name
            <input
              id="signup-displayName"
              name="displayName"
              autoComplete="name"
              maxLength={300}
              aria-invalid={Boolean(fieldErrors.displayName)}
              aria-describedby={fieldErrors.displayName ? 'signup-displayName-error' : undefined}
              required
            />
            {fieldErrors.displayName ? (
              <small id="signup-displayName-error" className="field-error">
                {fieldErrors.displayName}
              </small>
            ) : null}
          </label>
          <label>
            Email
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={320}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined}
              required
            />
            {fieldErrors.email ? (
              <small id="signup-email-error" className="field-error">
                {fieldErrors.email}
              </small>
            ) : null}
          </label>
          <label>
            Password
            <span className="password-field">
              <input
                name="password"
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={
                  fieldErrors.password ? 'password-help signup-password-error' : 'password-help'
                }
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
            <small id="password-help">Use at least 12 characters. Passphrases work well.</small>
            {fieldErrors.password ? (
              <small id="signup-password-error" className="field-error">
                {fieldErrors.password}
              </small>
            ) : null}
          </label>
          <label>
            Confirm password
            <input
              name="confirmation"
              id="signup-confirmation"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={12}
              maxLength={256}
              aria-invalid={Boolean(fieldErrors.confirmation)}
              aria-describedby={fieldErrors.confirmation ? 'signup-confirmation-error' : undefined}
              required
            />
            {fieldErrors.confirmation ? (
              <small id="signup-confirmation-error" className="field-error">
                {fieldErrors.confirmation}
              </small>
            ) : null}
          </label>
          {error ? (
            <p className="error" role="alert" tabIndex={-1}>
              {error}
            </p>
          ) : null}
          <button disabled={loading}>{loading ? 'Creating account…' : 'Create account'}</button>
        </form>
        <p className="auth-switch">
          Already have an account? <Link href={withReturnTo('/login', returnTo)}>Sign in</Link>
        </p>
      </div>
    </section>
  );
}
