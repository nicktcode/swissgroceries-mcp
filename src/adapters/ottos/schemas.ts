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
  productLabels: z.array(z.object({
    style: z.string().optional(),
    type: z.string().optional(),
    message: z.object({
      raw: z.string().optional(),
      key: z.string().optional(),
    }).passthrough().optional(),
  }).passthrough()).nullable().optional(),
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

const OttosAddressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  postalCode: z.string().optional(),
  town: z.string().optional(),
  phone: z.string().optional(),
  country: z.object({ isocode: z.string().optional() }).passthrough().optional(),
}).passthrough();

const OttosOpeningTimeSchema = z.object({
  formattedHour: z.string().optional(),
  hour: z.number().optional(),
  minute: z.number().optional(),
  meridiemIndicator: z.string().optional(),
}).passthrough();

const OttosWeekDayOpeningSchema = z.object({
  closed: z.boolean().optional(),
  weekDay: z.string().optional(),
  weekDayDisplay: z.string().optional(),
  openingTime: OttosOpeningTimeSchema.optional(),
  closingTime: OttosOpeningTimeSchema.optional(),
}).passthrough();

const OttosOpeningHoursSchema = z.object({
  weekDayOpeningList: z.array(OttosWeekDayOpeningSchema).optional(),
}).passthrough();

const OttosStoreSchema = z.object({
  name: z.string().optional(),
  displayName: z.string().optional(),
  formattedDistance: z.string().optional(),
  geoPoint: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }).passthrough().optional(),
  address: OttosAddressSchema.optional(),
  openingHours: OttosOpeningHoursSchema.optional(),
  todaySchedule: OttosWeekDayOpeningSchema.optional(),
  stockInfo: z.object({
    stockLevel: z.number().optional(),
    stockLevelStatus: z.string().optional(),
    isValueRounded: z.boolean().optional(),
  }).passthrough().optional(),
}).passthrough();

export const OttosStoreSearchResponseSchema = z.object({
  stores: z.array(OttosStoreSchema).optional(),
  pagination: z.object({
    totalResults: z.number().optional(),
  }).passthrough().optional(),
}).passthrough();

export const OttosStockResponseSchema = z.object({
  stores: z.array(OttosStoreSchema).optional(),
  product: z.unknown().optional(),
  pagination: z.object({
    totalResults: z.number().optional(),
  }).passthrough().optional(),
}).passthrough();
