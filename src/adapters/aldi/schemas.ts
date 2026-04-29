import { z } from 'zod';

export const AldiProductSchema = z.object({
  sku: z.string().optional(),
  name: z.string().optional(),
  brandName: z.string().nullable().optional(),
  sellingSize: z.string().nullable().optional(),
  price: z.object({
    amount: z.number().optional(),                  // integer in rappen
    amountRelevant: z.number().optional(),
    amountRelevantDisplay: z.string().optional(),
    wasPriceDisplay: z.string().nullable().optional(),
    comparison: z.number().nullable().optional(),
    comparisonDisplay: z.string().nullable().optional(),
    currencyCode: z.string().optional(),
  }).nullable().optional(),
  assets: z.array(z.object({ url: z.string().optional() })).optional(),
  categories: z.array(z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    urlSlugText: z.string().optional(),
  })).optional(),
  badges: z.array(z.object({
    items: z.array(z.object({
      displayText: z.string().nullable().optional(),
    })).optional(),
  })).optional(),
}).passthrough();

export const AldiSearchResponseSchema = z.object({
  data: z.array(AldiProductSchema).optional(),
  products: z.array(AldiProductSchema).optional(),
  results: z.array(AldiProductSchema).optional(),
}).passthrough();
