import { SUPPORTED_CURRENCIES, canonicalYoutubeUrl } from '@openraise/shared';
import { z } from 'zod';

/** Money arrives as a string of minor units so it survives JSON exactly. */
const minorUnits = z
  .string()
  .regex(/^\d{1,15}$/, 'A whole number of minor units, sent as a string')
  .transform((v) => BigInt(v))
  .refine((v) => v > 0n, 'Must be more than zero');

const futureDate = z.iso
  .datetime({ offset: true })
  .transform((v) => new Date(v))
  .refine((d) => d.getTime() > Date.now(), 'Must be in the future');

const title = z.string().trim().min(5, 'Use at least 5 characters').max(100);
const summary = z.string().trim().max(200);
const story = z.string().trim().max(20_000);
const shortText = z.string().trim().min(1).max(100);

const videoUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((value, ctx) => {
    const canonical = canonicalYoutubeUrl(value);
    if (!canonical) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Use a YouTube HTTPS video link, such as https://www.youtube.com/watch?v=M7lc1UVf-VE',
      });
      return z.NEVER;
    }
    return canonical;
  });

export const createCampaignSchema = z.object({
  title,
  categorySlug: z.string().trim().min(1).max(50),
  goalAmount: minorUnits,
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
  summary: summary.optional(),
  videoUrl: videoUrl.nullable().optional(),
  story: story.optional(),
  beneficiaryName: shortText.optional(),
  location: shortText.optional(),
  endsAt: futureDate.optional(),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/** Optional text fields accept null to clear them. */
export const updateCampaignSchema = z
  .object({
    title,
    categorySlug: z.string().trim().min(1).max(50),
    goalAmount: minorUnits,
    currency: z.enum(SUPPORTED_CURRENCIES),
    summary,
    videoUrl: videoUrl.nullable(),
    story,
    beneficiaryName: shortText.nullable(),
    location: shortText.nullable(),
    endsAt: futureDate.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Change at least one field');
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const rejectCampaignSchema = z.object({
  reason: z.string().trim().min(5, 'Tell the creator what to fix').max(500),
});

export const CAMPAIGN_SORTS = [
  'newest',
  'trending',
  'close-to-goal',
  'relevance',
] as const;
export type CampaignSort = (typeof CAMPAIGN_SORTS)[number];

export const listCampaignsSchema = z.object({
  category: z.string().trim().max(50).optional(),
  featured: z.enum(['true', 'false']).optional(),
  /** Free text, searched over title, summary, location and story. Empty is ignored. */
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  /** Defaults to relevance when searching, newest otherwise. */
  sort: z.enum(CAMPAIGN_SORTS).optional(),
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListCampaignsQuery = z.infer<typeof listCampaignsSchema>;

/** What a campaign needs before it can go to review. */
export const SUBMIT_REQUIREMENTS = {
  summaryMin: 10,
  storyMin: 100,
} as const;
