'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiAs } from '../_lib/api';
import type { OrganisationManage } from './organisations/types';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

/** The API's first field message, or its message, for a ?error= notice. */
function explain(error: ApiError): string {
  return error.errors[0]?.message ?? error.message;
}

function back(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params)}`);
}

export async function createOrganisation(form: FormData): Promise<void> {
  const returnTo = '/dashboard/organisations';
  const body: Record<string, string> = { name: text(form, 'name') };
  for (const key of ['about', 'website', 'location'])
    if (text(form, key)) body[key] = text(form, key);
  let id: string;
  try {
    const created = await apiAs<OrganisationManage>('/organisations', {
      method: 'POST',
      body,
      returnTo,
    });
    id = created.organisation.id;
  } catch (error) {
    if (error instanceof ApiError) back(returnTo, { error: explain(error) });
    throw error;
  }
  revalidatePath(returnTo);
  redirect(`/dashboard/organisations/${id}?notice=created`);
}

export async function saveOrganisation(form: FormData): Promise<void> {
  const id = text(form, 'id');
  const returnTo = `/dashboard/organisations/${id}`;
  try {
    await apiAs(`/organisations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      // Blank optional fields clear them.
      body: {
        name: text(form, 'name'),
        about: text(form, 'about'),
        website: text(form, 'website') || null,
        location: text(form, 'location') || null,
      },
      returnTo,
    });
  } catch (error) {
    if (error instanceof ApiError) back(returnTo, { error: explain(error) });
    throw error;
  }
  revalidatePath(returnTo);
  back(returnTo, { notice: 'saved' });
}

export async function inviteMember(form: FormData): Promise<void> {
  const id = text(form, 'id');
  const returnTo = `/dashboard/organisations/${id}`;
  let sent: { email: string; emailSent: boolean };
  try {
    sent = await apiAs(`/organisations/${encodeURIComponent(id)}/invites`, {
      method: 'POST',
      body: { email: text(form, 'email'), role: text(form, 'role') },
      returnTo,
    });
  } catch (error) {
    if (error instanceof ApiError)
      back(returnTo, {
        error:
          error.status === 429
            ? 'You’ve sent a lot of invitations. Try again in a few minutes.'
            : explain(error),
      });
    throw error;
  }
  revalidatePath(returnTo);
  back(returnTo, {
    notice: sent.emailSent ? 'invited' : 'invite-not-emailed',
    email: sent.email,
  });
}

export async function revokeInvite(form: FormData): Promise<void> {
  const id = text(form, 'id');
  const returnTo = `/dashboard/organisations/${id}`;
  try {
    await apiAs(
      `/organisations/${encodeURIComponent(id)}/invites/${encodeURIComponent(text(form, 'inviteId'))}`,
      { method: 'DELETE', returnTo },
    );
  } catch (error) {
    if (error instanceof ApiError) back(returnTo, { error: explain(error) });
    throw error;
  }
  revalidatePath(returnTo);
  back(returnTo, { notice: 'revoked' });
}

export async function changeMemberRole(form: FormData): Promise<void> {
  const id = text(form, 'id');
  const returnTo = `/dashboard/organisations/${id}`;
  try {
    await apiAs(
      `/organisations/${encodeURIComponent(id)}/members/${encodeURIComponent(text(form, 'memberId'))}`,
      { method: 'PATCH', body: { role: text(form, 'role') }, returnTo },
    );
  } catch (error) {
    if (error instanceof ApiError) back(returnTo, { error: explain(error) });
    throw error;
  }
  revalidatePath(returnTo);
  back(returnTo, { notice: 'role' });
}

/** Remove someone, or leave when it's your own membership. */
export async function removeMember(form: FormData): Promise<void> {
  const id = text(form, 'id');
  const leaving = text(form, 'leaving') === '1';
  const returnTo = `/dashboard/organisations/${id}`;
  try {
    await apiAs(
      `/organisations/${encodeURIComponent(id)}/members/${encodeURIComponent(text(form, 'memberId'))}`,
      { method: 'DELETE', returnTo },
    );
  } catch (error) {
    if (error instanceof ApiError) back(returnTo, { error: explain(error) });
    throw error;
  }
  revalidatePath('/dashboard/organisations');
  if (leaving) back('/dashboard/organisations', { notice: 'left' });
  back(returnTo, { notice: 'removed' });
}

export async function acceptInvite(form: FormData): Promise<void> {
  const token = text(form, 'token');
  const here = `/organisations/invite?${new URLSearchParams({ token })}`;
  let id: string;
  try {
    id = (
      await apiAs<{ id: string; slug: string }>('/organisation-invites/accept', {
        method: 'POST',
        body: { token },
        returnTo: here,
      })
    ).id;
  } catch (error) {
    if (error instanceof ApiError)
      redirect(`${here}&${new URLSearchParams({ error: explain(error) })}`);
    throw error;
  }
  revalidatePath('/dashboard/organisations');
  redirect(`/dashboard/organisations/${id}?notice=joined`);
}
