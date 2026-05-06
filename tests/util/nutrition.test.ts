import { describe, it, expect } from 'vitest';
import {
  classifyNutrientLabel,
  parseBasis,
  parseEnergyDual,
  parseGramValue,
} from '../../src/util/nutrition.js';

describe('classifyNutrientLabel', () => {
  it('matches German nutrient labels', () => {
    expect(classifyNutrientLabel('Fett')).toBe('fat');
    expect(classifyNutrientLabel('davon gesättigte Fettsäuren')).toBe('saturatedFat');
    expect(classifyNutrientLabel('Kohlenhydrate')).toBe('carbs');
    expect(classifyNutrientLabel('davon Zucker')).toBe('sugar');
    expect(classifyNutrientLabel('Eiweiss')).toBe('protein');
    expect(classifyNutrientLabel('Eiweiß')).toBe('protein');
    expect(classifyNutrientLabel('Salz')).toBe('salt');
    expect(classifyNutrientLabel('Nahrungsfasern (Ballaststoffe)')).toBe('fiber');
  });

  it('does not confuse "davon Zucker" with "Kohlenhydrate"', () => {
    expect(classifyNutrientLabel('davon Zucker')).toBe('sugar');
    expect(classifyNutrientLabel('Kohlenhydrate')).toBe('carbs');
  });

  it('does not confuse "davon gesättigte Fettsäuren" with "Fett"', () => {
    expect(classifyNutrientLabel('davon gesättigte Fettsäuren')).toBe('saturatedFat');
    expect(classifyNutrientLabel('Fett')).toBe('fat');
  });

  it('returns undefined for unknown labels', () => {
    expect(classifyNutrientLabel('Energie')).toBeUndefined();
    expect(classifyNutrientLabel('Vitamine')).toBeUndefined();
    expect(classifyNutrientLabel('')).toBeUndefined();
  });
});

describe('parseGramValue', () => {
  it('extracts plain numbers and decimal grams', () => {
    expect(parseGramValue('14g')).toBe(14);
    expect(parseGramValue('0.7 g')).toBe(0.7);
    expect(parseGramValue('853')).toBe(853);
  });

  it('handles comma decimals', () => {
    expect(parseGramValue('27,9g')).toBe(27.9);
  });

  it('strips ca./< prefixes from volgshop strings', () => {
    expect(parseGramValue('ca. 27.9g')).toBe(27.9);
    expect(parseGramValue('<0.1g')).toBe(0.1);
  });

  it('returns undefined for non-numeric input', () => {
    expect(parseGramValue('')).toBeUndefined();
    expect(parseGramValue(undefined)).toBeUndefined();
    expect(parseGramValue(null)).toBeUndefined();
    expect(parseGramValue('n/a')).toBeUndefined();
  });
});

describe('parseEnergyDual', () => {
  it('parses Migros-style "287 kJ (69 kcal)"', () => {
    expect(parseEnergyDual('287 kJ (69 kcal)')).toEqual({
      energyKj: 287,
      energyKcal: 69,
    });
  });

  it('parses slash-separated "853 kJ / 205 kcal"', () => {
    expect(parseEnergyDual('853 kJ / 205 kcal')).toEqual({
      energyKj: 853,
      energyKcal: 205,
    });
  });

  it('returns only the unit that is present', () => {
    expect(parseEnergyDual('287 kJ')).toEqual({ energyKj: 287 });
    expect(parseEnergyDual('69 kcal')).toEqual({ energyKcal: 69 });
  });

  it('returns empty for missing input', () => {
    expect(parseEnergyDual(undefined)).toEqual({});
    expect(parseEnergyDual('')).toEqual({});
  });
});

describe('parseBasis', () => {
  it('parses "100 ml" / "100g" / "pro 100 g"', () => {
    expect(parseBasis('100 ml')).toEqual({ value: 100, unit: 'ml' });
    expect(parseBasis('100g')).toEqual({ value: 100, unit: 'g' });
    expect(parseBasis('pro 100 g')).toEqual({ value: 100, unit: 'g' });
  });

  it('returns undefined when no g/ml unit is present', () => {
    expect(parseBasis('1 Glas (250 ml)')).toEqual({ value: 250, unit: 'ml' });
    expect(parseBasis('Portion')).toBeUndefined();
    expect(parseBasis(undefined)).toBeUndefined();
  });
});
