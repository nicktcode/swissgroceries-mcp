import { z } from 'zod';

export const CoopProductSchema = z.object({
  code: z.string().optional(),
  name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  brand: z.object({ name: z.string().optional() }).nullable().optional(),
  price: z.object({
    value: z.number().optional(),
    formattedValue: z.string().optional(),
  }).nullable().optional(),
  originalPrice: z.object({ value: z.number().optional() }).nullable().optional(),
  oldPrice: z.object({ value: z.number().optional() }).nullable().optional(),
  content: z.union([z.string(), z.number()]).optional(),
  contentUnit: z.string().optional(),
  images: z.array(z.object({ url: z.string().optional() })).optional(),
  primaryCategory: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
  }).nullable().optional(),
  categories: z.array(z.object({
    code: z.string().optional(),
    name: z.string().optional(),
  })).optional(),
  vegan: z.boolean().optional(),
  vegetarian: z.boolean().optional(),
  glutenFree: z.boolean().optional(),
  lactoseFree: z.boolean().optional(),
  regionalProduct: z.boolean().optional(),
  hasPromotion: z.boolean().optional(),
  weekPromotion: z.boolean().optional(),
  selectedPromotion: z.object({
    text: z.string().optional(),
  }).nullable().optional(),
  // Catch-all: don't fail on extra unknown fields
}).passthrough();

export const CoopSearchResponseSchema = z.object({
  products: z.array(CoopProductSchema).optional(),
}).passthrough();
