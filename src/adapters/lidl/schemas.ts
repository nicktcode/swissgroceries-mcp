import { z } from 'zod';

export const LidlProductSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  subtitle: z.string().nullable().optional(),
  additionalInfo: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  weight: z.string().nullable().optional(),
  mainPrice: z.object({
    price: z.number().optional(),
    oldPrice: z.number().nullable().optional(),
    currency: z.string().optional(),
    discount: z.string().nullable().optional(),
  }).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  imageUrls: z.array(z.string()).optional(),
}).passthrough();

export const LidlCampaignSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  products: z.array(LidlProductSchema).optional(),
  items: z.array(LidlProductSchema).optional(),
}).passthrough();

// Web storefront search API (/q/api/search). Each hit is an `item` with a
// `type` discriminator; product hits carry the full product record under
// `gridbox.data`. Kept permissive (passthrough) — we only assert the envelope
// and read fields defensively in normalizeSearchProduct.
export const LidlSearchResponseSchema = z.object({
  items: z.array(
    z.object({
      type: z.string().optional(),
      gridbox: z.object({
        data: z.record(z.any()).optional(),
      }).passthrough().optional(),
    }).passthrough(),
  ).optional(),
}).passthrough();

export const LidlCampaignGroupsSchema = z.object({
  groups: z.array(z.object({
    title: z.string().optional(),
    campaigns: z.array(z.object({
      id: z.string().optional(),
      campaignId: z.string().optional(),
    })).optional(),
  })).optional(),
  campaigns: z.array(z.object({
    id: z.string().optional(),
    campaignId: z.string().optional(),
  })).optional(),
}).passthrough();
