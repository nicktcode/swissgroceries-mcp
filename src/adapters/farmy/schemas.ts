import { z } from 'zod';

export const FarmyProductSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  name: z.string().optional(),
  sku: z.string().optional(),
  description: z.string().nullable().optional(),
  display_price: z.union([z.string(), z.number()]).optional(),
  price: z.union([z.string(), z.number()]).optional(),
  strikeout_price: z.union([z.string(), z.number()]).nullable().optional(),
  price_per_100g: z.union([z.string(), z.number()]).nullable().optional(),
  packaging: z.string().nullable().optional(),
  unit_name: z.string().nullable().optional(),
  seo_url: z.string().nullable().optional(),
  image: z.union([
    z.string(),
    z.object({ large_url: z.string().optional(), medium_url: z.string().optional(), url: z.string().optional() }).passthrough(),
  ]).nullable().optional(),
  certificates: z.array(z.object({ name: z.string().optional() }).passthrough()).optional(),
  filter_certificates: z.array(z.object({ name: z.string().optional() }).passthrough()).optional(),
  categories: z.array(z.object({ name: z.string().optional() }).passthrough()).optional(),
  ribbon_data: z.unknown().optional(),
  producer: z.object({ name: z.string().optional() }).passthrough().nullable().optional(),
  supplier: z.object({ name: z.string().optional() }).passthrough().nullable().optional(),
}).passthrough();

export const FarmySearchResponseSchema = z.object({
  products: z.array(FarmyProductSchema).optional(),
  total_count: z.number().optional(),
}).passthrough();
