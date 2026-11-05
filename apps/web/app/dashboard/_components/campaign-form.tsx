'use client';

import { SUPPORTED_CURRENCIES } from '@openraise/shared';
import { decimalInput } from '../../_lib/campaign';
import { saveCampaign, type FormState } from '../actions';
import {
  canChangeCurrency,
  canEdit,
  STORY_MIN,
  SUMMARY_MIN,
  type Category,
  type OwnerCampaign,
} from '../_lib/types';
import { useFormAction } from './use-form-action';

const CURRENCY_NAMES: Record<string, string> = {
  NGN: 'Nigerian naira (NGN)',
  USD: 'US dollar (USD)',
  GHS: 'Ghanaian cedi (GHS)',
  KES: 'Kenyan shilling (KES)',
};

/** Create a campaign, or edit one. Errors from the API appear by each field. */
export function CampaignForm({
  campaign,
  categories,
}: {
  campaign?: OwnerCampaign;
  categories: Category[];
}) {
  const { state, run: action, pending, version } = useFormAction<FormState>(saveCampaign, {});
  const editable = !campaign || canEdit(campaign.status);
  const currencyLocked = !!campaign && !canChangeCurrency(campaign.status);
  const value = (name: string, fallback: string | null | undefined) =>
    state.values?.[name] ?? fallback ?? '';
  const error = (name: string) =>
    state.errors?.[name] ? (
      <p className="field-error" id={`${name}-error`}>
        {state.errors[name]}
      </p>
    ) : null;
  const invalid = (name: string) =>
    state.errors?.[name]
      ? { 'aria-invalid': true, 'aria-describedby': `${name}-error` }
      : {};

  return (
    <form action={action} className="campaign-form" noValidate key={version}>
      {campaign && <input type="hidden" name="id" value={campaign.id} />}
      {currencyLocked && (
        <input type="hidden" name="lockedCurrency" value={campaign!.currency} />
      )}
      <fieldset disabled={!editable || pending}>
        <legend className="sr-only">Campaign details</legend>

        <div className="form-field">
          <label htmlFor="title">Campaign title</label>
          <input
            id="title"
            name="title"
            maxLength={100}
            required
            defaultValue={value('title', campaign?.title)}
            placeholder="Help Ada finish nursing school"
            {...invalid('title')}
          />
          {error('title')}
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="categorySlug">Category</label>
            <select
              id="categorySlug"
              name="categorySlug"
              defaultValue={value('categorySlug', campaign?.category.slug)}
              {...invalid('categorySlug')}
            >
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            {error('categorySlug')}
          </div>
          <div className="form-field">
            <label htmlFor="currency">Currency</label>
            <select
              id="currency"
              name="currency"
              defaultValue={value('currency', campaign?.currency ?? 'NGN')}
              disabled={currencyLocked}
              aria-describedby="currency-hint"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_NAMES[c] ?? c}
                </option>
              ))}
            </select>
            <p className="field-hint" id="currency-hint">
              {currencyLocked
                ? 'Fixed once a campaign has been submitted.'
                : 'Donations are made in this currency.'}
            </p>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="goal">Goal</label>
            <input
              id="goal"
              name="goal"
              inputMode="decimal"
              required
              defaultValue={value('goal', campaign ? decimalInput(campaign.goalAmount) : '')}
              placeholder="500000"
              {...invalid('goal')}
            />
            {error('goal')}
          </div>
          <div className="form-field">
            <label htmlFor="endsAt">
              End date <span className="optional">optional</span>
            </label>
            <input
              id="endsAt"
              name="endsAt"
              type="date"
              defaultValue={value('endsAt', campaign?.endsAt?.slice(0, 10))}
              {...invalid('endsAt')}
            />
            {error('endsAt')}
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="summary">Summary</label>
          <textarea
            id="summary"
            name="summary"
            rows={2}
            maxLength={200}
            defaultValue={value('summary', campaign?.summary)}
            placeholder="One or two sentences people see on campaign cards."
            aria-describedby="summary-hint"
            {...invalid('summary')}
          />
          <p className="field-hint" id="summary-hint">
            At least {SUMMARY_MIN} characters before you submit. Up to 200.
          </p>
          {error('summary')}
        </div>

        <div className="form-field">
          <label htmlFor="story">Story</label>
          <textarea
            id="story"
            name="story"
            rows={12}
            maxLength={20000}
            defaultValue={value('story', campaign?.story)}
            placeholder="Who is this for, what will the money do, and why now?"
            aria-describedby="story-hint"
            {...invalid('story')}
          />
          <p className="field-hint" id="story-hint">
            At least {STORY_MIN} characters before you submit. Plain text; blank
            lines start a new paragraph.
          </p>
          {error('story')}
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="beneficiaryName">
              Raising for <span className="optional">optional</span>
            </label>
            <input
              id="beneficiaryName"
              name="beneficiaryName"
              maxLength={100}
              defaultValue={value('beneficiaryName', campaign?.beneficiaryName)}
              placeholder="Yourself, a person or a group"
              {...invalid('beneficiaryName')}
            />
            {error('beneficiaryName')}
          </div>
          <div className="form-field">
            <label htmlFor="location">
              Location <span className="optional">optional</span>
            </label>
            <input
              id="location"
              name="location"
              maxLength={100}
              defaultValue={value('location', campaign?.location)}
              placeholder="Enugu, Nigeria"
              {...invalid('location')}
            />
            {error('location')}
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="videoUrl">
            YouTube video <span className="optional">optional</span>
          </label>
          <input
            id="videoUrl"
            name="videoUrl"
            type="url"
            inputMode="url"
            defaultValue={value('videoUrl', campaign?.videoUrl)}
            placeholder="https://www.youtube.com/watch?v=…"
            {...invalid('videoUrl')}
          />
          {error('videoUrl')}
        </div>
      </fieldset>

      {editable && (
        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={pending}>
            {pending ? 'Saving…' : campaign ? 'Save changes' : 'Create draft'}
          </button>
          <p
            className={state.ok ? 'form-status ok' : 'form-status'}
            role="status"
            aria-live="polite"
          >
            {state.message}
          </p>
        </div>
      )}
    </form>
  );
}
