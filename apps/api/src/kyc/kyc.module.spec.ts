import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { createKycProvider } from './kyc.module.js';

function config(values: Record<string, string>) {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (!value) throw new Error(`Missing ${key}`);
      return value;
    },
  } as unknown as ConfigService<Env, true>;
}

describe('createKycProvider', () => {
  it('defaults to manual review', () => {
    const provider = createKycProvider(config({ KYC_PROVIDER: 'manual' }));
    expect(provider.name).toBe('manual');
    expect(provider.needsDocument).toBe(true);
    expect(provider.needsSelfie).toBe(false);
  });
  it.each([
    [
      'qoreid',
      {
        QOREID_CLIENT_ID: 'c',
        QOREID_SECRET: 's',
        QOREID_BASE_URL: 'https://api.qoreid.com',
      },
      false,
      true,
    ],
    [
      'dojah',
      {
        DOJAH_APP_ID: 'a',
        DOJAH_SECRET_KEY: 's',
        DOJAH_BASE_URL: 'https://sandbox.dojah.io',
      },
      false,
      true,
    ],
    [
      'smile',
      {
        SMILE_PARTNER_ID: 'p',
        SMILE_API_KEY: 'k',
        SMILE_CALLBACK_URL: 'https://example.com/webhooks/kyc/smile',
        SMILE_PRIVACY_POLICY_URL: 'https://example.com/privacy',
        SMILE_BASE_URL: 'https://testapi.smileidentity.com',
      },
      false,
      false,
    ],
  ] as const)(
    'builds the %s adapter',
    (name, extra, needsDocument, needsSelfie) => {
      const provider = createKycProvider(
        config({ KYC_PROVIDER: name, ...extra }),
      );
      expect(provider.name).toBe(name);
      expect(provider.needsDocument).toBe(needsDocument);
      expect(provider.needsSelfie).toBe(needsSelfie);
    },
  );
  it('fails loudly when credentials for the selected provider are missing', () => {
    expect(() =>
      createKycProvider(
        config({
          KYC_PROVIDER: 'dojah',
          DOJAH_BASE_URL: 'https://sandbox.dojah.io',
        }),
      ),
    ).toThrow(/DOJAH_APP_ID/);
  });
});
