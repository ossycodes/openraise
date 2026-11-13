import type { IdentityCheck, KycProvider } from '../kyc-provider.js';

/**
 * For deployments without a KYC vendor contract: the creator uploads a photo
 * of their ID and an administrator compares it with what they entered.
 */
export class ManualKycProvider implements KycProvider {
  readonly name = 'manual' as const;
  readonly needsDocument = true;
  readonly needsSelfie = false;

  check(): Promise<IdentityCheck> {
    return Promise.resolve({ status: 'PENDING', reference: null });
  }
}
