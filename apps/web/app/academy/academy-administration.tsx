'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api';

type AcademyRole = 'OWNER' | 'ADMIN' | 'COACH' | 'STUDENT';
type MembershipStatus = 'ACTIVE' | 'DISABLED';

interface ApiError {
  error?: { message?: string };
}

interface CurrentUser {
  memberships: Array<{ academyId: string; role: AcademyRole; status: MembershipStatus }>;
}

interface Membership {
  id: string;
  userId: string | null;
  role: AcademyRole;
  status: MembershipStatus;
  displayName: string;
}

interface Invitation {
  id: string;
  normalizedEmail: string;
  role: AcademyRole;
  existingMembershipId: string | null;
  status: string;
  deliveryStatus: string;
  expiresAt: string;
}

interface AuditEvent {
  id: string;
  action: string;
  outcome: string;
  targetType: string;
  occurredAt: string;
  requestId: string | null;
}

async function body<Value>(response: Response): Promise<Value> {
  const value = (await response.json()) as Value & ApiError;
  if (!response.ok) throw new Error(value.error?.message ?? `Request failed (${response.status}).`);
  return value;
}

function pretty(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ');
}

export function AcademyAdministration({ academyId }: { academyId: string }) {
  const [role, setRole] = useState<AcademyRole | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [membershipRole, setMembershipRole] = useState<AcademyRole>('COACH');
  const [invitationRole, setInvitationRole] = useState<AcademyRole>('COACH');

  const refresh = useCallback(async () => {
    if (!academyId) return;
    const me = await body<CurrentUser>(
      await fetch(`${apiUrl}/auth/me`, { credentials: 'include' }),
    );
    const active = me.memberships.find(
      (membership) => membership.academyId === academyId && membership.status === 'ACTIVE',
    );
    setRole(active?.role ?? null);
    if (active?.role !== 'OWNER' && active?.role !== 'ADMIN') {
      setMemberships([]);
      setInvitations([]);
      setAuditEvents([]);
      return;
    }
    const [membershipResponse, invitationResponse, auditResponse] = await Promise.all([
      fetch(`${apiUrl}/academies/${academyId}/memberships`, { credentials: 'include' }),
      fetch(`${apiUrl}/academies/${academyId}/invitations`, { credentials: 'include' }),
      fetch(`${apiUrl}/academies/${academyId}/audit?limit=30&offset=0`, {
        credentials: 'include',
      }),
    ]);
    const [nextMemberships, nextInvitations, nextAudit] = await Promise.all([
      body<Membership[]>(membershipResponse),
      body<Invitation[]>(invitationResponse),
      body<{ events: AuditEvent[] }>(auditResponse),
    ]);
    setMemberships(nextMemberships);
    setInvitations(nextInvitations);
    setAuditEvents(nextAudit.events);
  }, [academyId]);

  useEffect(() => {
    setError(null);
    void refresh().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not load Academy administration.');
    });
  }, [refresh]);

  async function mutate(action: () => Promise<string>): Promise<void> {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The Academy operation failed.');
    } finally {
      setLoading(false);
    }
  }

  function createMembership(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutate(async () => {
      const created = await body<Membership>(
        await fetch(`${apiUrl}/academies/${academyId}/memberships`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            displayName: String(data.get('displayName') ?? ''),
            role: membershipRole,
          }),
        }),
      );
      form.reset();
      setMembershipRole('COACH');
      return `Created unclaimed ${created.role} membership ${created.id}.`;
    });
  }

  function createStudentProfile(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutate(async () => {
      await body(
        await fetch(`${apiUrl}/academies/${academyId}/students`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            membershipId: String(data.get('membershipId') ?? ''),
            playerId: String(data.get('playerId') ?? ''),
            requiresGuardianConsent: data.get('requiresGuardianConsent') === 'on',
          }),
        }),
      );
      form.reset();
      return 'Linked the Student membership to its canonical Player.';
    });
  }

  function createInvitation(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const existingMembershipId = String(data.get('existingMembershipId') ?? '').trim();
    void mutate(async () => {
      const result = await body<{ invitation: Invitation; deliveryStatus: string }>(
        await fetch(`${apiUrl}/academies/${academyId}/invitations`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: String(data.get('email') ?? ''),
            role: invitationRole,
            existingMembershipId: existingMembershipId || null,
          }),
        }),
      );
      form.reset();
      setInvitationRole('COACH');
      return `Invitation delivered with status ${result.deliveryStatus}.`;
    });
  }

  function updateMembership(event: FormEvent<HTMLFormElement>, membership: Membership): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate(async () => {
      const updated = await body<Membership>(
        await fetch(`${apiUrl}/academies/${academyId}/memberships/${membership.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ role: data.get('role'), status: data.get('status') }),
        }),
      );
      return `${updated.displayName} is ${updated.status.toLowerCase()} as ${updated.role}.`;
    });
  }

  if (!academyId || (role !== 'OWNER' && role !== 'ADMIN')) return null;

  const roles: AcademyRole[] =
    role === 'OWNER' ? ['OWNER', 'ADMIN', 'COACH', 'STUDENT'] : ['ADMIN', 'COACH', 'STUDENT'];
  const unclaimedStudents = memberships.filter(
    (membership) => membership.role === 'STUDENT' && membership.userId === null,
  );
  const unclaimedForInvitation = memberships.filter(
    (membership) =>
      membership.role === invitationRole &&
      membership.status === 'ACTIVE' &&
      membership.userId === null,
  );

  return (
    <section className="academy-administration" aria-label="Academy administration">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Security and enrollment</span>
          <h2>Academy administration</h2>
          <p>Visible to OWNER/ADMIN; every mutation is still authorized by the server.</p>
        </div>
        <button className="secondary-button" disabled={loading} onClick={() => void refresh()}>
          Refresh administration
        </button>
      </div>
      {notice ? <p className="status status-info">{notice}</p> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="academy-admin-grid">
        <form className="stacked-form" data-testid="create-membership" onSubmit={createMembership}>
          <h3>Create unclaimed membership</h3>
          <label>
            Member display name
            <input name="displayName" required />
          </label>
          <label>
            Membership role
            <select
              value={membershipRole}
              onChange={(event) => setMembershipRole(event.target.value as AcademyRole)}
            >
              {roles.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <button disabled={loading}>Create membership</button>
        </form>

        <form
          className="stacked-form"
          data-testid="link-student-profile"
          onSubmit={createStudentProfile}
        >
          <h3>Link Student profile</h3>
          <label>
            Unclaimed Student membership
            <select name="membershipId" required defaultValue="">
              <option value="" disabled>
                Select membership
              </option>
              {unclaimedStudents.map((membership) => (
                <option value={membership.id} key={membership.id}>
                  {membership.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Canonical Player ID
            <input name="playerId" required />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" name="requiresGuardianConsent" />
            Require Academy-recorded guardian consent
          </label>
          <button disabled={loading || unclaimedStudents.length === 0}>Link Student profile</button>
        </form>

        <form className="stacked-form" data-testid="create-invitation" onSubmit={createInvitation}>
          <h3>Create invitation</h3>
          <label>
            Invitation email
            <input name="email" type="email" required />
          </label>
          <label>
            Invitation role
            <select
              value={invitationRole}
              onChange={(event) => setInvitationRole(event.target.value as AcademyRole)}
            >
              {roles.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Existing membership (required for Student)
            <select name="existingMembershipId" defaultValue="">
              <option value="">Create membership on acceptance</option>
              {unclaimedForInvitation.map((membership) => (
                <option value={membership.id} key={membership.id}>
                  {membership.displayName}
                </option>
              ))}
            </select>
          </label>
          <button disabled={loading}>Deliver invitation</button>
        </form>
      </div>

      <h3>Membership lifecycle</h3>
      <div className="academy-management-list">
        {memberships.map((membership) => {
          const ownerLockedForAdmin = role === 'ADMIN' && membership.role === 'OWNER';
          return (
            <form key={membership.id} onSubmit={(event) => updateMembership(event, membership)}>
              <span>
                <b>{membership.displayName}</b>
                <small>{membership.userId ? 'claimed' : 'unclaimed'}</small>
              </span>
              <label>
                <span className="sr-only">Role for {membership.displayName}</span>
                <select name="role" defaultValue={membership.role} disabled={ownerLockedForAdmin}>
                  {roles.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Status for {membership.displayName}</span>
                <select
                  name="status"
                  defaultValue={membership.status}
                  disabled={ownerLockedForAdmin}
                >
                  <option>ACTIVE</option>
                  <option>DISABLED</option>
                </select>
              </label>
              <button className="secondary-button" disabled={loading || ownerLockedForAdmin}>
                Update {membership.displayName}
              </button>
            </form>
          );
        })}
      </div>

      <div className="academy-admin-grid">
        <section>
          <h3>Invitations</h3>
          {invitations.slice(0, 10).map((invitation) => (
            <p className="academy-admin-record" key={invitation.id}>
              <b>{invitation.normalizedEmail}</b>
              <span>
                {invitation.role} · {invitation.status} · {invitation.deliveryStatus}
              </span>
            </p>
          ))}
          {invitations.length === 0 ? <p className="help-text">No invitations yet.</p> : null}
        </section>
        <section>
          <h3>Security audit</h3>
          {auditEvents.slice(0, 10).map((event) => (
            <p className="academy-admin-record" key={event.id}>
              <b>{pretty(event.action)}</b>
              <span>
                {pretty(event.outcome)} · {event.targetType} ·{' '}
                {new Date(event.occurredAt).toLocaleString()}
              </span>
            </p>
          ))}
          {auditEvents.length === 0 ? (
            <p className="help-text">No Academy audit events yet.</p>
          ) : null}
        </section>
      </div>
    </section>
  );
}
