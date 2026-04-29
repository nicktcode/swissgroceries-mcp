import { z } from 'zod';

const PriceSchema = z.object({
  value: z.number().optional(),
  currencyIso: z.string().optional(),
  formattedValue: z.string().optional(),
  priceType: z.string().optional(),
}).passthrough();

const CategorySchema = z.object({
  code: z.string().optional(),
  name: z.string().optional(),
  url: z.string().optional(),
  excludeFromProductBreadcrumb: z.boolean().optional(),
}).passthrough();

const ImageSchema = z.object({
  url: z.string().optional(),
  format: z.string().optional(),
  imageType: z.string().optional(),
  galleryIndex: z.number().optional(),
}).passthrough();

const StockSchema = z.object({
  stockLevelStatus: z.string().optional(),
  stockLevel: z.number().optional(),
}).passthrough();

export const OttosProductSchema = z.object({
  code: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  brand: z.string().optional(),
  url: z.string().optional(),
  categories: z.array(CategorySchema).optional(),
  price: PriceSchema.optional(),
  insteadOfPrice: PriceSchema.nullable().optional(),
  basePrice: PriceSchema.nullable().optional(),
  images: z.array(ImageSchema).optional(),
  stock: StockSchema.optional(),
  unitName: z.string().nullable().optional(),
  productLabels: z.array(z.string()).nullable().optional(),
  purchasable: z.boolean().optional(),
}).passthrough();

export const OttosSearchResponseSchema = z.object({
  products: z.array(OttosProductSchema).optional(),
  pagination: z.object({
    currentPage: z.number().optional(),
    pageSize: z.number().optional(),
    totalPages: z.number().optional(),
    totalResults: z.number().optional(),
  }).passthrough().optional(),
  freeTextSearch: z.string().optional(),
}).passthrough();
