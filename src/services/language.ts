/**
 * Swiss official catalogue languages the chains actually publish in. Romansh
 * (rm) is official nationally but no grocery chain exposes a Romansh catalogue,
 * so it is intentionally out of scope.
 */
export type SwissLanguage = 'de' | 'fr' | 'it';

/**
 * Best-effort mapping from a Swiss location to the language its region shops in,
 * used to query each chain's catalogue in the right language when the caller
 * doesn't specify one. This is a coarse heuristic, not a cantonal boundary map:
 *
 *   - PLZ 1000–2999  → French  (Romandie: VD, GE, NE, JU + Romand FR/VS)
 *   - PLZ 6500–6999  → Italian (Ticino + Italian Grisons)
 *   - everything else → German
 *
 * It is deliberately conservative at bilingual borders (Fribourg, Biel/Bienne,
 * Valais, Grisons): a wrong guess only picks a less-ideal catalogue language,
 * and callers can always pass an explicit `language` to override it. A ZIP is a
 * far better signal than coordinates, so it wins when both are available; the
 * lat/lng fallback uses broad longitude/latitude bands and errs toward German
 * (the national plurality) in the ambiguous Bern/Valais corridor.
 */
export function inferLanguage(loc: { zip?: string; lat?: number; lng?: number }): SwissLanguage {
  const zipNum = loc.zip !== undefined ? Number.parseInt(loc.zip, 10) : NaN;
  if (Number.isFinite(zipNum)) {
    if (zipNum >= 1000 && zipNum <= 2999) return 'fr';
    if (zipNum >= 6500 && zipNum <= 6999) return 'it';
    return 'de';
  }

  if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
    // Ticino sits south of the Alps: low latitude, eastern longitude.
    if (loc.lat < 46.55 && loc.lng > 8.7) return 'it';
    // Romandie is the western strip; keep the cut west of Bern (~7.44°E) so the
    // capital stays German. Sion/Valais (~7.36°E) is missed here on purpose —
    // pass a ZIP or explicit language for a precise result inland.
    if (loc.lng < 7.3) return 'fr';
  }

  return 'de';
}
