-- Vendor KYC adapters can verify a Bank Verification Number as well as a
-- NIN slip, so BVN becomes a document type a creator can submit.
ALTER TYPE "IdentityDocumentType" ADD VALUE 'BVN';
