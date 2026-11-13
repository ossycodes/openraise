import { z } from 'zod';

const name = z.string().trim().min(1).max(60);
const description = z.string().trim().max(200);
const sortOrder = z.number().int().min(0).max(10_000);

export const createCategorySchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(50)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Use lower-case letters, numbers and hyphens',
    ),
  reason: z.string().trim().min(5).max(500).optional(),
  name,
  description: description.default(''),
  sortOrder: sortOrder.default(0),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/** The slug is part of public URLs, so it can't be changed. */
export const updateCategorySchema = z
  .object({
    name,
    description,
    sortOrder,
    expectedUpdatedAt: z.iso.datetime(),
    reason: z.string().trim().min(5).max(500),
  })
  .partial()
  .refine(
    (v) => ['name', 'description', 'sortOrder'].some((key) => key in v),
    'Change at least one field',
  );
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
