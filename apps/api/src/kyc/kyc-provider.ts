export const KYC_PROVIDER = Symbol('KYC_PROVIDER');

export type KycProviderName = 'manual';
export type IdentityDocument =
  | 'NIN_SLIP'
  | 'PASSPORT'
  | 'DRIVERS_LICENCE'
  | 'VOTERS_CARD';

export interface IdentitySubmission {
  userId: string;
  documentType: IdentityDocument;
  /** The full ID number. Adapters may send it to their vendor; it's never stored. */
  idNumber: string;
  legalName: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
}

/**
 * What a provider concluded. PENDING means a person (or a slower vendor
 * check) still has to decide; the row stays open until then.
 */
export type IdentityCheck =
  | { status: 'PENDING'; reference: string | null }
  | { status: 'VERIFIED'; reference: string | null; verifiedName: string }
  | { status: 'REJECTED'; reference: string | null; reason: string };

/**
 * Identity verification behind one interface, chosen by KYC_PROVIDER. Vendor
 * SDKs and HTTP calls stay inside their adapter.
 */
export interface KycProvider {
  readonly name: KycProviderName;
  /** Whether the creator must upload a photo of their ID. */
  readonly needsDocument: boolean;
  check(input: IdentitySubmission): Promise<IdentityCheck>;
}
