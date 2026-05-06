import type { Nutrition } from '../adapters/types.js';

// Each chain returns nutrient labels in (mostly) German with slight
// variations. We map by label substring so adapters don't have to
// reinvent this — and so callers get a consistent set of fields.
//
// Match order matters: the more specific "davon gesättigte Fettsäuren"
// must be tested before "fett" and "davon zucker" before "zucker", or
// we'd miscategorise the indented sub-rows.

type NutrientKey = Exclude<keyof Nutrition, 'basis'>;

const LABEL_MATCHERS: Array<{ key: NutrientKey; rx: RegExp }> = [
  { key: 'saturatedFat', rx: /ges[äa]ttigte\s*fetts[äa]uren|saturated/i },
  { key: 'sugar',        rx: /zucker|sugar/i },
  { key: 'fiber',        rx: /ballaststoff|nahrungsfaser|fibre|fiber/i },
  { key: 'fat',          rx: /^fett\b|^fat\b/i },
  { key: 'carbs',        rx: /kohlenhydrate|carbohydrate/i },
  { key: 'protein',      rx: /eiwei[sß]+|protein/i },
  { key: 'salt',         rx: /salz|salt/i },
];

/**
 * Match a label string to a known nutrient key. Returns undefined when
 * the label is unrecognised or refers to energy (callers handle energy
 * separately because it carries two units in one row).
 */
export function classifyNutrientLabel(label: string): NutrientKey | undefined {
  for (const { key, rx } of LABEL_MATCHERS) {
    if (rx.test(label)) return key;
  }
  return undefined;
}

/**
 * Pull a leading numeric value out of a string like "14g", "0.7 g",
 * "<0.1g", "ca. 27.9g" or just "853". Returns undefined when no number
 * is present. Comma decimals are accepted (some chains localise).
 */
export function parseGramValue(s: string | undefined | null): number | undefined {
  if (s == null) return undefined;
  const m = s.match(/(-?\d+(?:[.,]\d+)?)/);
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse an "Energie" cell that contains both units, e.g.
 * "287 kJ (69 kcal)" or "853 kJ / 205 kcal".
 */
export function parseEnergyDual(s: string | undefined | null): {
  energyKj?: number;
  energyKcal?: number;
} {
  if (!s) return {};
  const kj = s.match(/(-?\d+(?:[.,]\d+)?)\s*kj/i);
  const kc = s.match(/(-?\d+(?:[.,]\d+)?)\s*kcal/i);
  const out: { energyKj?: number; energyKcal?: number } = {};
  if (kj) {
    const n = parseFloat(kj[1].replace(',', '.'));
    if (Number.isFinite(n)) out.energyKj = n;
  }
  if (kc) {
    const n = parseFloat(kc[1].replace(',', '.'));
    if (Number.isFinite(n)) out.energyKcal = n;
  }
  return out;
}

/**
 * Parse a basis string like "100 ml", "100g", "pro 100 g" into the
 * canonical {value, unit} pair. Returns undefined when the unit isn't
 * grams or millilitres — we don't synthesise fictional bases.
 */
export function parseBasis(s: string | undefined | null): Nutrition['basis'] | undefined {
  if (!s) return undefined;
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i);
  if (!m) return undefined;
  const value = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return { value, unit: m[2].toLowerCase() as 'g' | 'ml' };
}
