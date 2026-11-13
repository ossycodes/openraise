import type { Currency } from '@openraise/shared';
import { apiAs } from '../../_lib/api';
import { decimalInput } from '../../_lib/campaign';
import {
  OperationForm,
  type OperationField,
} from '../_components/operation-form';
export const metadata = { title: 'Deployment settings' };
export default async function Settings() {
  const {
    values: v,
    version,
    currency,
  } = await apiAs<{
    values: {
      name: string;
      logoUrl: string | null;
      primaryColor: string | null;
      supportEmail: string | null;
      platformFeeBps: number;
      donorFeeBps: number;
      donorFlatFee: string;
      donorFlatFeeThreshold: string;
      withdrawalFee: string;
    };
    version: number;
    currency: Currency;
  }>('/admin/settings', { returnTo: '/admin/settings' });
  const fields: OperationField[] = [
    { name: 'name', label: 'Site name', value: v.name },
    {
      name: 'logoUrl',
      label: 'Logo URL',
      type: 'url',
      value: v.logoUrl ?? '',
      nullable: true,
    },
    {
      name: 'primaryColor',
      label: 'Accent colour, for example #1e5b43',
      value: v.primaryColor ?? '',
      nullable: true,
    },
    {
      name: 'supportEmail',
      label: 'Support email',
      type: 'email',
      value: v.supportEmail ?? '',
      nullable: true,
    },
    {
      name: 'platformFeeBps',
      label: 'Platform fee (%)',
      value: decimalInput(String(v.platformFeeBps)),
      percent: true,
    },
    {
      name: 'donorFeeBps',
      label: 'Donor processing fee (%)',
      value: decimalInput(String(v.donorFeeBps)),
      percent: true,
    },
    ...(
      ['donorFlatFee', 'donorFlatFeeThreshold', 'withdrawalFee'] as const
    ).map((name, i) => ({
      name,
      label: `${['Flat donor fee', 'Flat fee threshold', 'Withdrawal fee'][i]} (${currency})`,
      value: decimalInput(v[name]),
      currency,
    })),
  ];
  return (
    <>
      <div className="review-title">
        <div>
          <div className="section-eyebrow">Your deployment</div>
          <h1>Branding & fees</h1>
          <p>
            Changes apply to new quotes and checkouts. Existing payment and
            withdrawal amounts stay as recorded.
          </p>
        </div>
      </div>
      <OperationForm
        key={version}
        title="Site settings"
        path="settings"
        settings
        fixed={{ expectedVersion: version }}
        fields={fields}
        confirmation="I have reviewed the branding and every fee shown above."
      />
    </>
  );
}
