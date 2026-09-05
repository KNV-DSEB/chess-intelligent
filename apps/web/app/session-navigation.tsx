'use client';

import { useEffect, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface SessionUser {
  displayName: string | null;
  email: string;
  memberships: Array<{ academyId: string; role: string; status: string }>;
}

export function SessionNavigation() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [logoutFailed, setLogoutFailed] = useState(false);

  useEffect(() => {
    void fetch(`${apiUrl}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? ((await response.json()) as SessionUser) : null))
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  async function logout(): Promise<void> {
    setLogoutFailed(false);
    const response = await fetch(`${apiUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) {
      setLogoutFailed(true);
      return;
    }
    setUser(null);
    window.location.assign('/login');
  }

  if (user === undefined) return <span className="session-status">Checking session…</span>;
  if (!user) return <a href="/login">Sign in</a>;
  return (
    <span className="session-status">
      <a href="/my">{user.displayName ?? user.email}</a>
      <button className="link-button" type="button" onClick={() => void logout()}>
        Sign out
      </button>
      {logoutFailed ? <span role="alert">Sign out failed. Try again.</span> : null}
    </span>
  );
}
