'use server';

import { isCurrency, toMinorUnits, type Currency } from '@openraise/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiAs } from '../_lib/api';
import type { OwnerCampaign } from './_lib/types';

export interface FormState {
  ok?: boolean;
  message?: string;
  /** Field name → message */
  errors?: Record<string, string>;
  /** What was typed, so a failed save doesn't wipe the form */
  values?: Record<string, string>;
}

/** API field paths → this form's field names */
const FIELD: Record<string, string> = { goalAmount: 'goal' };
const TEXT_FIELDS = ['title', 'summary', 'story', 'videoUrl', 'beneficiaryName', 'location'] as const;

function fromApiError(error: ApiError, values?: Record<string, string>): FormState {
  const errors: Record<string, string> = {};
  for (const e of error.errors) errors[FIELD[e.path] ?? e.path] ??= e.message;
  return {
    message: error.errors.length ? 'Check the highlighted fields.' : error.message,
    errors,
    values,
  };
}

/** Creates a draft (no id) or saves changes to an existing campaign. */
export async function saveCampaign(_: FormState, form: FormData): Promise<FormState> {
  const values = Object.fromEntries(
    [...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']),
  );
  const id = values.id || '';
  const currency = (values.currency || values.lockedCurrency || 'NGN') as Currency;
  const errors: Record<string, string> = {};
  if (!isCurrency(currency)) errors.currency = 'Choose a currency';
  if (!values.title?.trim()) errors.title = 'Give your campaign a title';

  const body: Record<string, unknown> = {};
  for (const key of TEXT_FIELDS) {
    const v = (values[key] ?? '').trim();
    // On create, blanks are left out; on edit, a blank clears the field.
    if (v) body[key] = v;
    else if (id && key !== 'title')
      body[key] = key === 'summary' || key === 'story' ? '' : null;
  }
  if (values.categorySlug) body.categorySlug = values.categorySlug;
  else errors.categorySlug = 'Choose a category';
  try {
    const goal = toMinorUnits(values.goal ?? '', currency);
    if (goal <= 0n) throw new RangeError();
    body.goalAmount = goal.toString();
  } catch (e) {
    errors.goal =
      e instanceof RangeError && e.message.startsWith('At most')
        ? e.message
        : 'Enter the amount you want to raise, like 500000';
  }
  if (values.currency) body.currency = values.currency;
  if (values.endsAt) body.endsAt = `${values.endsAt}T23:59:59Z`;
  else if (id) body.endsAt = null;

  if (Object.keys(errors).length)
    return { message: 'Check the highlighted fields.', errors, values };

  try {
    if (!id) {
      const created = await apiAs<OwnerCampaign>('/campaigns', {
        method: 'POST',
        body,
        returnTo: '/dashboard/campaigns/new',
      });
      revalidatePath('/dashboard');
      redirect(`/dashboard/campaigns/${created.id}?created=1`);
    }
    await apiAs(`/campaigns/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body,
      returnTo: `/dashboard/campaigns/${id}`,
    });
  } catch (error) {
    // redirect() throws too; only API refusals become form messages.
    if (error instanceof ApiError) return fromApiError(error, values);
    throw error;
  }
  revalidatePath('/dashboard', 'layout');
  return { ok: true, message: 'Changes saved.', values };
}

const ACTIONS = ['submit', 'pause', 'resume', 'end'] as const;

/** Submit for review, pause, resume or end a campaign. */
export async function changeStatus(_: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  if (!ACTIONS.includes(action as (typeof ACTIONS)[number]))
    return { message: 'Unknown action' };
  try {
    await apiAs(`/campaigns/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      returnTo: `/dashboard/campaigns/${id}`,
    });
  } catch (error) {
    if (error instanceof ApiError) return fromApiError(error);
    throw error;
  }
  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

/** Deletes a draft. Anything that has been submitted is kept. */
export async function deleteDraft(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  await apiAs(`/campaigns/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    returnTo: `/dashboard/campaigns/${id}`,
  });
  revalidatePath('/dashboard');
  redirect('/dashboard?deleted=1');
}

/** Removes a photo, or moves one to the front to make it the cover. */
export async function updatePhotos(_: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id') ?? '');
  const imageId = String(form.get('imageId') ?? '');
  const op = String(form.get('op') ?? '');
  const path = `/campaigns/${encodeURIComponent(id)}/images`;
  try {
    if (op === 'remove') {
      await apiAs(`${path}/${encodeURIComponent(imageId)}`, {
        method: 'DELETE',
        returnTo: `/dashboard/campaigns/${id}`,
      });
    } else if (op === 'cover') {
      const order = String(form.get('order') ?? '').split(',').filter(Boolean);
      await apiAs(`${path}/order`, {
        method: 'PUT',
        body: { imageIds: [imageId, ...order.filter((i) => i !== imageId)] },
        returnTo: `/dashboard/campaigns/${id}`,
      });
    } else {
      return { message: 'Unknown action' };
    }
  } catch (error) {
    if (error instanceof ApiError) return { message: error.message };
    throw error;
  }
  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}
