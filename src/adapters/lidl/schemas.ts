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

// lidl.ch storefront product record (search `items[].gridbox.data`, or an
// element of the /p/api/gridboxes array).
export const LidlCatalogProductSchema = z.object({
  erpNumber: z.string().optional(),
  fullTitle: z.string().optional(),
  category: z.string().optional(),
  canonicalUrl: z.string().optional(),
  image: z.string().optional(),
  brand: z.object({ name: z.string().optional(), showBrand: z.boolean().optional() }).passthrough().nullable().optional(),
  price: z.object({
    price: z.number().nullable().optional(),
    oldPrice: z.number().nullable().optional(),
  }).passthrough().nullable().optional(),
  keyfacts: z.object({ description: z.string().nullable().optional() }).passthrough().nullable().optional(),
}).passthrough();

export const LidlSearchResponseSchema = z.object({
  numFound: z.number().optional(),
  items: z.array(z.object({
    type: z.string().optional(),
    gridbox: z.object({ data: LidlCatalogProductSchema.optional() }).passthrough().optional(),
  }).passthrough()).optional(),
}).passthrough();

export const LidlGridboxResponseSchema = z.array(LidlCatalogProductSchema);
