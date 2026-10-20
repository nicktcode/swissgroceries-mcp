import { z } from 'zod';

const PriceSchema = z.object({
  value: z.number().optional(),
  currencyIso: z.string().optional(),
  formattedValue: z.string().optional(),
}).passthrough();

const ImageSchema = z.object({
  url: z.string().optional(),
  format: z.string().optional(),
  imageType: z.string().optional(),
}).passthrough();

export const CoopCityProductSchema = z.object({
  code: z.string().optional(),
  name: z.string().optional(),
  manufacturer: z.string().optional(),
  url: z.string().optional(),
  price: PriceSchema.optional(),
  images: z.array(ImageSchema).optional(),
  stock: z.object({ stockLevelStatus: z.string().optional() }).passthrough().optional(),
}).passthrough();

export const CoopCitySearchResponseSchema = z.object({
  products: z.array(CoopCityProductSchema).optional(),
  pagination: z.object({ totalResults: z.number().optional() }).passthrough().optional(),
}).passthrough();

const StoreSchema = z.object({
  name: z.string().optional(),
  displayName: z.string().optional(),
  geoPoint: z.object({ latitude: z.number().optional(), longitude: z.number().optional() }).passthrough().optional(),
  address: z.object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    postalCode: z.string().optional(),
    town: z.string().optional(),
  }).passthrough().optional(),
  stockInfo: z.object({
    stockLevel: z.number().optional(),
    stockLevelStatus: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

// /stores and /products/{code}/stock share the store list shape.
export const CoopCityStoreListResponseSchema = z.object({
  stores: z.array(StoreSchema).optional(),
  pagination: z.object({ totalResults: z.number().optional() }).passthrough().optional(),
}).passthrough();
