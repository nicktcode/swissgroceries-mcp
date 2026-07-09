import { describe, it, expect } from 'vitest';
import { inferLanguage } from '../../src/services/language.js';

describe('inferLanguage', () => {
  it('maps Romandie ZIPs to French', () => {
    expect(inferLanguage({ zip: '1227' })).toBe('fr'); // Genève
    expect(inferLanguage({ zip: '1003' })).toBe('fr'); // Lausanne
    expect(inferLanguage({ zip: '2000' })).toBe('fr'); // Neuchâtel
  });

  it('maps Ticino ZIPs to Italian', () => {
    expect(inferLanguage({ zip: '6900' })).toBe('it'); // Lugano
    expect(inferLanguage({ zip: '6500' })).toBe('it'); // Bellinzona
  });

  it('maps German-region ZIPs to German, including Central-CH 6xxx below Ticino', () => {
    expect(inferLanguage({ zip: '8001' })).toBe('de'); // Zürich
    expect(inferLanguage({ zip: '3011' })).toBe('de'); // Bern
    expect(inferLanguage({ zip: '6003' })).toBe('de'); // Luzern (not Ticino)
  });

  it('falls back to coordinates when no ZIP is given', () => {
    expect(inferLanguage({ lat: 46.2, lng: 6.14 })).toBe('fr');  // Geneva
    expect(inferLanguage({ lat: 46.0, lng: 8.95 })).toBe('it');  // Lugano
    expect(inferLanguage({ lat: 47.37, lng: 8.54 })).toBe('de'); // Zürich
  });

  it('prefers the ZIP over coordinates when both are present', () => {
    // ZIP says Zürich (de) even though the coordinates are in Geneva.
    expect(inferLanguage({ zip: '8001', lat: 46.2, lng: 6.14 })).toBe('de');
  });

  it('defaults to German with no usable signal', () => {
    expect(inferLanguage({})).toBe('de');
    expect(inferLanguage({ zip: 'not-a-zip' })).toBe('de');
  });
});
