/** ISO-2 / common country names → ISO 4217 display currency. */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  RW: 'RWF',
  RWANDA: 'RWF',
  UG: 'UGX',
  UGANDA: 'UGX',
  KE: 'KES',
  KENYA: 'KES',
  TZ: 'TZS',
  TANZANIA: 'TZS',
  NG: 'NGN',
  NIGERIA: 'NGN',
  GH: 'GHS',
  GHANA: 'GHS',
  ZA: 'ZAR',
  'SOUTH AFRICA': 'ZAR',
  US: 'USD',
  USA: 'USD',
  'UNITED STATES': 'USD',
  'UNITED STATES OF AMERICA': 'USD',
  GB: 'GBP',
  UK: 'GBP',
  'UNITED KINGDOM': 'GBP',
  EU: 'EUR',
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  IE: 'EUR',
  PT: 'EUR',
  FI: 'EUR',
  GR: 'EUR',
  CA: 'CAD',
  CANADA: 'CAD',
  AU: 'AUD',
  AUSTRALIA: 'AUD',
  IN: 'INR',
  INDIA: 'INR',
  PH: 'PHP',
  PHILIPPINES: 'PHP',
  AE: 'AED',
  'UNITED ARAB EMIRATES': 'AED',
  SA: 'SAR',
  'SAUDI ARABIA': 'SAR',
  EG: 'EGP',
  EGYPT: 'EGP',
  TR: 'TRY',
  TURKEY: 'TRY',
  BR: 'BRL',
  BRAZIL: 'BRL',
  MX: 'MXN',
  MEXICO: 'MXN',
  CN: 'CNY',
  CHINA: 'CNY',
  JP: 'JPY',
  JAPAN: 'JPY',
  KR: 'KRW',
  'SOUTH KOREA': 'KRW',
  BI: 'BIF',
  BURUNDI: 'BIF',
  CD: 'CDF',
  'DR CONGO': 'CDF',
  'DEMOCRATIC REPUBLIC OF THE CONGO': 'CDF',
  CM: 'XAF',
  CAMEROON: 'XAF',
  SN: 'XOF',
  SENEGAL: 'XOF',
  CI: 'XOF',
  "COTE D'IVOIRE": 'XOF',
  "CÔTE D'IVOIRE": 'XOF',
  ZM: 'ZMW',
  ZAMBIA: 'ZMW',
  MW: 'MWK',
  MALAWI: 'MWK',
  MZ: 'MZN',
  MOZAMBIQUE: 'MZN',
  ET: 'ETB',
  ETHIOPIA: 'ETB',
  SO: 'SOS',
  SOMALIA: 'SOS',
  SS: 'SSP',
  'SOUTH SUDAN': 'SSP',
  SD: 'SDG',
  SUDAN: 'SDG',
};

/** Currencies users can pick as a display override. */
export const DISPLAY_CURRENCY_OPTIONS = [
  'USDT',
  'RWF',
  'UGX',
  'KES',
  'TZS',
  'NGN',
  'GHS',
  'ZAR',
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'INR',
  'PHP',
  'AED',
  'SAR',
  'EGP',
  'TRY',
  'BRL',
  'MXN',
  'CNY',
  'JPY',
  'KRW',
  'BIF',
  'CDF',
  'XAF',
  'XOF',
  'ZMW',
  'MWK',
  'MZN',
  'ETB',
] as const;

export type DisplayCurrencyCode = (typeof DISPLAY_CURRENCY_OPTIONS)[number];

export function normalizeCurrencyCode(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (code === 'LOCAL') return 'LOCAL';
  if (!/^[A-Z]{3,4}$/.test(code)) return null;
  return code;
}

export function isSupportedDisplayCurrency(code: string): boolean {
  return (DISPLAY_CURRENCY_OPTIONS as readonly string[]).includes(code);
}

/**
 * Map free-text / ISO-2 country to an ISO 4217 currency.
 * Returns null when unknown (caller should fall back to USDT).
 */
export function currencyFromCountry(
  country: string | null | undefined,
): string | null {
  if (!country?.trim()) return null;
  const key = country.trim().toUpperCase().replace(/\s+/g, ' ');
  return COUNTRY_TO_CURRENCY[key] ?? null;
}

/**
 * Resolve display currency.
 * Default is always USDT. Users can pick LOCAL (country currency) or a specific code.
 */
export function resolvePreferredDisplayCurrency(opts: {
  preferredCurrency?: string | null;
  country?: string | null;
}): {
  code: string;
  derivedFromCountry: string | null;
  preferredCurrency: string | null;
  localCurrencyCode: string | null;
} {
  const localCurrencyCode = currencyFromCountry(opts.country);
  const preferred = normalizeCurrencyCode(opts.preferredCurrency);

  if (!preferred || preferred === 'USDT') {
    return {
      code: 'USDT',
      derivedFromCountry: null,
      preferredCurrency: preferred === 'USDT' ? 'USDT' : null,
      localCurrencyCode,
    };
  }

  if (preferred === 'LOCAL') {
    return {
      code: localCurrencyCode ?? 'USDT',
      derivedFromCountry: localCurrencyCode ? opts.country?.trim() ?? null : null,
      preferredCurrency: 'LOCAL',
      localCurrencyCode,
    };
  }

  return {
    code: preferred,
    derivedFromCountry: null,
    preferredCurrency: preferred,
    localCurrencyCode,
  };
}
