import { z } from 'zod';

// Price object. Populated ONLY when the article is currently "en action"
// (on promotion); null otherwise — Aligro does not publish regular prices
// online. Carries both the regular (salesPrice*) and discounted (discountPrice*)
// figures plus a unit price.
export const AligroPriceSchema = z
  .object({
    market: z.object({ id: z.number().optional(), code: z.number().optional() }).nullable().optional(),
    nextWeek: z.boolean().optional(),
    promoCode: z.string().nullable().optional(),
    public: z.boolean().optional(),
    visible: z.boolean().optional(),
    salesPriceTTC: z.number().nullable().optional(),
    salesPriceHT: z.number().nullable().optional(),
    discountPriceTTC: z.number().nullable().optional(),
    discountPriceHT: z.number().nullable().optional(),
    unitPrice: z.number().nullable().optional(),
    discountRatePrivate: z.number().nullable().optional(),
    discountRatePro: z.number().nullable().optional(),
  })
  .passthrough();

const TranslationFrSchema = z
  .object({
    description: z.string().nullable().optional(),
    advertisingText: z.string().nullable().optional(),
    brand: z.string().nullable().optional(),
    weightVolume: z.string().nullable().optional(),
    origin: z.string().nullable().optional(),
    quantityLabel: z.string().nullable().optional(),
  })
  .passthrough();

export const AligroArticleSchema = z
  .object({
    id: z.number().optional(),
    sKU: z.string().optional(),
    frozen: z.boolean().optional(),
    article: z
      .object({
        articleNumber: z.number().optional(),
        articleGroup: z
          .object({
            code: z.number().optional(),
            translations: z
              .object({ fr: z.object({ wording: z.string().optional() }).passthrough().optional() })
              .passthrough()
              .optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    translations: z.object({ fr: TranslationFrSchema.optional() }).passthrough().optional(),
    quantityLabelForUnitPrice: z.string().nullable().optional(),
    href: z.object({ self: z.string().optional() }).passthrough().optional(),
    images: z.object({ main: z.record(z.string()).optional() }).passthrough().optional(),
    mainArticleDetailPrice: AligroPriceSchema.nullable().optional(),
  })
  .passthrough();

export const AligroSearchContainerSchema = z
  .object({
    current_page_number: z.number().optional(),
    items_per_page: z.number().optional(),
    total_items: z.number().optional(),
    items: z.array(AligroArticleSchema).optional(),
  })
  .passthrough();

export const AligroMarketSchema = z
  .object({
    id: z.number().optional(),
    code: z.number().optional(),
    translations: z
      .object({
        fr: z.object({ name: z.string().optional() }).passthrough().optional(),
        de: z.object({ name: z.string().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const AligroMarketsSchema = z.array(AligroMarketSchema);

export type AligroArticle = z.infer<typeof AligroArticleSchema>;
export type AligroPrice = z.infer<typeof AligroPriceSchema>;
export type AligroMarket = z.infer<typeof AligroMarketSchema>;
