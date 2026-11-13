export const KYC_PROVIDER = Symbol('KYC_PROVIDER');

export type KycProviderName = 'manual' | 'qoreid' | 'dojah' | 'smile';
export type IdentityDocument =
  'NIN_SLIP' | 'BVN' | 'PASSPORT' | 'DRIVERS_LICENCE' | 'VOTERS_CARD';

export interface IdentitySubmission {
  userId: string;
  /** Locally reserved reference, persisted before a vendor can send its callback. */
  reference?: string;
  documentType: IdentityDocument;
  /** The full ID number. Adapters may send it to their vendor; it's never stored. */
  idNumber: string;
  legalName: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  /** The person's account email; some vendors require a contact for the check. */
  email?: string;
  /** Explicit permission to send identity details to the selected vendor. */
  consent?: boolean;
  /** A live selfie for face match, when the provider supports it. Never stored raw. */
  selfie?: { bytes: Uint8Array; contentType: string };
}

/**
 * What a provider concluded. PENDING means a person (or a slower vendor
 * check) still has to decide; the row stays open until then.
 */
export type IdentityCheck =
  | { status: 'PENDING'; reference: string | null }
  | {
      status: 'VERIFIED';
      reference: string | null;
      verifiedName: string;
      /** Authority date of birth (YYYY-MM-DD) when a later result supplies it. */
      verifiedDateOfBirth?: string;
    }
  | { status: 'REJECTED'; reference: string | null; reason: string };

/** A vendor result delivered later (webhook), keyed by its reference. */
export interface IdentityResultEvent {
  reference: string;
  check: IdentityCheck;
}

export type WebhookHeaders = Readonly<
  Record<string, string | string[] | undefined>
>;

/**
 * A vendor call that could not produce a trustworthy answer: transport
 * failure, an upstream outage, a billing/auth problem, or a response we
 * cannot parse. Callers must not turn this into a verification or a
 * rejection; the check simply has not happened.
 */
export class KycProviderError extends Error {
  constructor(
    public readonly code:
      | 'invalid-input'
      | 'invalid-response'
      | 'http-error'
      | 'transport-error'
      | 'invalid-signature'
      | 'unsupported',
    public readonly status?: number,
  ) {
    super(`KYC provider ${code}${status ? ` (${status})` : ''}`);
    this.name = 'KycProviderError';
  }
}

/**
 * Identity verification behind one interface, chosen by KYC_PROVIDER. Vendor
 * SDKs and HTTP calls stay inside their adapter.
 */
export interface KycProvider {
  readonly name: KycProviderName;
  /** Whether the creator must upload a photo of their ID. */
  readonly needsDocument: boolean;
  /** Whether the creator must take a selfie for a face match. */
  readonly needsSelfie: boolean;
  readonly privacyPolicyUrl?: string;
  check(input: IdentitySubmission): Promise<IdentityCheck>;
  /** Verify a later result webhook's signature. Required with parseResult. */
  verifyResult?(
    headers: WebhookHeaders,
    body: unknown,
    token?: string,
  ): boolean;
  /** Parse a later result webhook body. Unknown events return null. */
  parseResult?(body: unknown): IdentityResultEvent | null;
}
