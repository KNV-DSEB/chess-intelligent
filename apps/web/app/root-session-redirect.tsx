'use client';

import { useEffect } from 'react';

import { apiUrl } from './api-client';

interface SessionUser {
  memberships: Array<{
    academyId: string;
    role: 'OWNER' | 'ADMIN' | 'COACH' | 'STUDENT';
    status: string;
  }>;
}

export function RootSessionRedirect() {
  useEffect(() => {
    void fetch(`${apiUrl}/auth/me`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return;
        const user = (await response.json()) as SessionUser;
        const memberships = user.memberships.filter((membership) => membership.status === 'ACTIVE');
        if (memberships.length === 0) {
          window.location.replace('/onboarding');
          return;
        }
        if (memberships.length !== 1) {
          window.location.replace('/my');
          return;
        }
        const membership = memberships[0]!;
        window.location.replace(
          membership.role === 'STUDENT'
            ? `/academy/${membership.academyId}/my`
            : `/academy?academyId=${membership.academyId}`,
        );
      })
      .catch(() => undefined);
  }, []);
  return null;
}
