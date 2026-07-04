/**
 * Optional Indian vehicle number validation.
 *
 * Validation is only performed when a value is entered — an empty string is
 * always considered valid (the field is optional).
 *
 * Supported common Indian formats (case-insensitive, spaces/hyphens ignored):
 *  1. Standard private/commercial:   MH 12 AB 1234   -> SS DD L(1-2) NNNN
 *  2. Newer single-letter series:    DL 1 A 1234
 *  3. Bharat (BH) series:            22 BH 1234 AA   -> YY BH NNNN L(1-2)
 *  4. Vintage / older series:        MH 01 1234       (no letter series)
 *
 * State codes are validated against the official list of RTO state/UT codes.
 */

const STATE_CODES = new Set([
  'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR',
  'JH', 'JK', 'KA', 'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD',
  'OR', 'PB', 'PY', 'RJ', 'SK', 'TN', 'TR', 'TS', 'UK', 'UA', 'UP', 'WB',
  // legacy / union territory codes still seen on plates
  'AN', 'CT',
]);

export interface VehicleValidationResult {
  valid: boolean;
  error?: string;
  normalized?: string;
}

/** Strip spaces/hyphens and uppercase. */
export function normalizeVehicleNumber(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase();
}

/** Format for display: MH12AB1234 -> MH 12 AB 1234 (best-effort grouping). */
export function formatVehicleNumber(raw: string): string {
  const v = normalizeVehicleNumber(raw);
  // BH series: 22BH1234AA -> 22 BH 1234 AA
  const bh = v.match(/^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/);
  if (bh) return `${bh[1]} ${bh[2]} ${bh[3]} ${bh[4]}`;
  // standard: MH12AB1234 -> MH 12 AB 1234
  const std = v.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/);
  if (std) return [std[1], std[2], std[3], std[4]].filter(Boolean).join(' ');
  return v;
}

export function validateVehicleNumber(raw: string): VehicleValidationResult {
  // Optional: empty is valid.
  if (!raw || !raw.trim()) return { valid: true };

  const v = normalizeVehicleNumber(raw);

  if (v.length < 5) {
    return { valid: false, error: 'Vehicle number looks too short.' };
  }
  if (v.length > 11) {
    return { valid: false, error: 'Vehicle number looks too long.' };
  }
  if (!/^[A-Z0-9]+$/.test(v)) {
    return { valid: false, error: 'Only letters and numbers are allowed.' };
  }

  // Bharat (BH) series: YY BH NNNN L(1-2)
  const bh = v.match(/^(\d{2})BH(\d{4})([A-Z]{1,2})$/);
  if (bh) {
    return { valid: true, normalized: formatVehicleNumber(v) };
  }
  if (/BH/.test(v) && !bh) {
    return { valid: false, error: 'Invalid BH-series format. Example: 22 BH 1234 AA' };
  }

  // Standard: SS DD L(0-3) NNNN
  const std = v.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/);
  if (!std) {
    return { valid: false, error: 'Invalid format. Example: MH 12 AB 1234' };
  }

  const [, state, , , number] = std;
  if (!STATE_CODES.has(state)) {
    return { valid: false, error: `"${state}" is not a valid state code.` };
  }
  if (Number(number) === 0) {
    return { valid: false, error: 'Vehicle number cannot be all zeros.' };
  }

  return { valid: true, normalized: formatVehicleNumber(v) };
}
