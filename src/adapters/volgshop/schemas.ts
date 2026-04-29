import { z } from 'zod';

export const VolgshopAttributeSchema = z.object({
  name: z.string().optional(),
  terms: z.array(z.object({ name: z.string().optional(), slug: z.string().optional() }).passthrough()).optional(),
}).passthrough();

export const VolgshopProductSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  name: z.string().optional(),
  sku: z.string().optional(),
  slug: z.string().optional(),
  permalink: z.string().optional(),
  description: z.string().nullable().optional(),
  short_description: z.string().nullable().optional(),
  on_sale: z.boolean().optional(),
  is_in_stock: z.boolean().optional(),
  is_purchasable: z.boolean().optional(),
  low_stock_remaining: z.number().nullable().optional(),
  prices: z.object({
    price: z.string().optional(),                 // minor units
    regular_price: z.string().optional(),
    sale_price: z.string().optional(),
    currency_code: z.string().optional(),
    currency_minor_unit: z.number().optional(),   // 2 → divide by 100
  }).passthrough().optional(),
  images: z.array(z.object({ src: z.string().optional(), thumbnail: z.string().optional() }).passthrough()).optional(),
  categories: z.array(z.object({ name: z.string().optional(), slug: z.string().optional() }).passthrough()).optional(),
  tags: z.array(z.object({ name: z.string().optional() }).passthrough()).optional(),
  brands: z.array(z.object({ name: z.string().optional() }).passthrough()).optional(),
  attributes: z.array(VolgshopAttributeSchema).optional(),
}).passthrough();

// The Store API returns a top-level array, not an object.
export const VolgshopSearchResponseSchema = z.array(VolgshopProductSchema);
