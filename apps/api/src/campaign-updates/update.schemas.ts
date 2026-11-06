import { z } from 'zod';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../campaigns/image-type.js';
export const updateInputSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    body: z.string().trim().min(10).max(5000),
    imageKeys: z.array(z.string().min(1).max(300)).max(3).default([]),
  })
  .strict()
  .refine((v) => new Set(v.imageKeys).size === v.imageKeys.length, {
    message: 'Choose each photo once',
    path: ['imageKeys'],
  });
export type UpdateInput = z.infer<typeof updateInputSchema>;
export const uploadInputSchema = z
  .object({
    contentType: z.enum(IMAGE_TYPES),
    size: z.number().int().positive().max(MAX_IMAGE_BYTES),
  })
  .strict();
export const updatePageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export const unsubscribeSchema = z
  .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
