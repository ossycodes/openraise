import { z } from 'zod';

export const ORGANISATION_ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'FINANCE'] as const;
export type OrganisationRoleName = (typeof ORGANISATION_ROLES)[number];

const name = z.string().trim().min(2).max(100);
const about = z.string().trim().max(2000);
const website = z
  .string()
  .trim()
  .max(200)
  .url('Enter a full web address, like https://example.org')
  .refine((v) => /^https?:\/\//i.test(v), 'Use an http or https address');
const location = z.string().trim().max(100);

export const createOrganisationSchema = z
  .object({
    name,
    about: about.optional(),
    website: website.optional(),
    location: location.optional(),
  })
  .strict();
export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;

/** A blank optional field clears it (null). */
export const updateOrganisationSchema = z
  .object({
    name: name.optional(),
    about: about.optional(),
    website: website.nullable().optional(),
    location: location.nullable().optional(),
  })
  .strict();
export type UpdateOrganisationInput = z.infer<typeof updateOrganisationSchema>;

export const inviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Enter an email address').max(254),
    role: z.enum(ORGANISATION_ROLES),
  })
  .strict();
export type InviteInput = z.infer<typeof inviteSchema>;

export const roleSchema = z.object({ role: z.enum(ORGANISATION_ROLES) }).strict();
export type RoleInput = z.infer<typeof roleSchema>;

export const tokenSchema = z
  .object({ token: z.string().min(20).max(200) })
  .strict();
export type TokenInput = z.infer<typeof tokenSchema>;
