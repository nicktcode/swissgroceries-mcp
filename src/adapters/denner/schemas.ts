import { z } from 'zod';

const Multilang = z.union([
  z.string(),
  z.object({
    de: z.string().nullable().optional(),
    fr: z.string().nullable().optional(),
    it: z.string().nullable().optional(),
  }),
]);

export const DennerProductSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  title: Multilang.optional(),
  description: Multilang.optional(),
  imageUrl: z.string().nullable().optional(),
  priceDiscount: z.number().nullable().optional(),
  priceOrigin: z.number().nullable().optional(),
  priceOverride: z.union([z.number(), z.record(z.unknown())]).nullable().optional(),
  ecoLabels: z.array(z.string()).optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  publicationId: z.union([z.string(), z.number()]).optional(),
  groupIds: z.array(z.union([z.string(), z.number()])).optional(),
}).passthrough();

export const DennerContentResponseSchema = z.object({
  v: z.number().optional(),
  products: z.array(DennerProductSchema).optional(),
  productsDel: z.array(z.union([z.string(), z.number()])).optional(),
  publications: z.array(z.unknown()).optional(),
  banners: z.array(z.unknown()).optional(),
  groups: z.array(z.unknown()).optional(),
}).passthrough();
