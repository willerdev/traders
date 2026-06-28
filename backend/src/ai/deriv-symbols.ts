/**
 * Deriv MT5 / API symbol codes and common display-name / shorthand aliases.
 * Source: deriv-com/deriv-app active_symbols, Deriv academy symbol sheets.
 */

/** Official MT5 symbol → Deriv display name. */
export const DERIV_MT5_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  // 1s Volatility Indices
  '1HZ10V': 'Volatility 10 (1s) Index',
  '1HZ15V': 'Volatility 15 (1s) Index',
  '1HZ25V': 'Volatility 25 (1s) Index',
  '1HZ30V': 'Volatility 30 (1s) Index',
  '1HZ50V': 'Volatility 50 (1s) Index',
  '1HZ75V': 'Volatility 75 (1s) Index',
  '1HZ90V': 'Volatility 90 (1s) Index',
  '1HZ100V': 'Volatility 100 (1s) Index',
  '1HZ150V': 'Volatility 150 (1s) Index',
  '1HZ200V': 'Volatility 200 (1s) Index',
  '1HZ250V': 'Volatility 250 (1s) Index',
  '1HZ300V': 'Volatility 300 (1s) Index',
  // Standard Volatility Indices (2s tick)
  R_10: 'Volatility 10 Index',
  R_25: 'Volatility 25 Index',
  R_50: 'Volatility 50 Index',
  R_75: 'Volatility 75 Index',
  R_100: 'Volatility 100 Index',
  // Crash / Boom
  BOOM300N: 'Boom 300 Index',
  BOOM500: 'Boom 500 Index',
  BOOM1000: 'Boom 1000 Index',
  CRASH300N: 'Crash 300 Index',
  CRASH500: 'Crash 500 Index',
  CRASH1000: 'Crash 1000 Index',
  // Jump Indices
  JD10: 'Jump 10 Index',
  JD25: 'Jump 25 Index',
  JD50: 'Jump 50 Index',
  JD75: 'Jump 75 Index',
  JD100: 'Jump 100 Index',
  JD150: 'Jump 150 Index',
  JD200: 'Jump 200 Index',
  // Step / Bear / Bull
  STPRNG: 'Step Index',
  RDBEAR: 'Bear Market Index',
  RDBULL: 'Bull Market Index',
  // Baskets
  WLDAUD: 'AUD Basket',
  WLDEUR: 'EUR Basket',
  WLDGBP: 'GBP Basket',
  WLDXAU: 'Gold Basket',
  WLDUSD: 'USD Basket',
  // Commodities / metals (Deriv FRX codes)
  FRXXAUUSD: 'Gold/USD',
  FRXXAGUSD: 'Silver/USD',
  FRXXPTUSD: 'Platinum/USD',
  FRXXPDUSD: 'Palladium/USD',
  FRXBROUSD: 'Oil/USD',
  // Common forex (Deriv FRX codes on MT5)
  FRXEURUSD: 'EUR/USD',
  FRXGBPUSD: 'GBP/USD',
  FRXUSDJPY: 'USD/JPY',
  FRXUSDCHF: 'USD/CHF',
  FRXUSDCAD: 'USD/CAD',
  FRXAUDUSD: 'AUD/USD',
  FRXNZDUSD: 'NZD/USD',
  FRXEURGBP: 'EUR/GBP',
  FRXEURJPY: 'EUR/JPY',
  FRXGBPJPY: 'GBP/JPY',
  FRXAUDJPY: 'AUD/JPY',
  FRXEURAUD: 'EUR/AUD',
  FRXEURCAD: 'EUR/CAD',
  FRXEURCHF: 'EUR/CHF',
  FRXEURNZD: 'EUR/NZD',
  FRXGBPAUD: 'GBP/AUD',
  FRXGBPCAD: 'GBP/CAD',
  FRXGBPCHF: 'GBP/CHF',
  FRXNZDJPY: 'NZD/JPY',
  FRXUSDNOK: 'USD/NOK',
  FRXUSDSEK: 'USD/SEK',
  FRXUSDPLN: 'USD/PLN',
  FRXAUDCAD: 'AUD/CAD',
  FRXAUDCHF: 'AUD/CHF',
  FRXAUDNZD: 'AUD/NZD',
  FRXGBPNOK: 'GBP/NOK',
  // Crypto (Deriv)
  CRYBTCUSD: 'BTC/USD',
  CRYETHUSD: 'ETH/USD',
  CRYLTCUSD: 'LTC/USD',
  CRYBCHUSD: 'BCH/USD',
  CRYBNBUSD: 'BNB/USD',
  CRYBTCLTC: 'BTC/LTC',
};

const VOL_1S_LEVELS = [10, 15, 25, 30, 50, 75, 90, 100, 150, 200, 250, 300] as const;
const VOL_STD_LEVELS = [10, 25, 50, 75, 100] as const;

export function normalizeSymbolKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function displayNameKey(displayName: string): string {
  const with1s = displayName.replace(/\(\s*1\s*s\s*\)/gi, '1S');
  return with1s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function buildAliasMap(): Record<string, string> {
  const map: Record<string, string> = {};

  const add = (alias: string, canonical: string) => {
    const key = normalizeSymbolKey(alias);
    if (!key || map[key]) return;
    map[key] = canonical;
  };

  for (const [canonical, display] of Object.entries(DERIV_MT5_DISPLAY_NAMES)) {
    add(canonical, canonical);
    add(display, canonical);
    add(displayNameKey(display), canonical);
  }

  for (const n of VOL_1S_LEVELS) {
    const code = `1HZ${n}V`;
    add(`HZ${n}V`, code);
    add(`VIX${n}1S`, code);
    add(`VIX${n}S`, code);
    add(`VOLATILITY${n}1S`, code);
    add(`VOLATILITY${n}1SINDEX`, code);
    add(`VOL${n}1S`, code);
    add(`V${n}1S`, code);
    // Bare V75 / VOL75 → 1s series (common shorthand on Deriv MT5)
    add(`V${n}`, code);
    add(`VOL${n}`, code);
    add(`VIX${n}`, code);
  }

  for (const n of VOL_STD_LEVELS) {
    const code = `R_${n}`;
    add(`R${n}`, code);
    add(`VOLATILITY${n}`, code);
    add(`VOLATILITY${n}INDEX`, code);
    add(`V${n}INDEX`, code);
    add(`STANDARDVOLATILITY${n}`, code);
  }

  // Crash / Boom shorthands
  for (const [canonical, prefix] of [
    ['BOOM300N', 'BOOM300'],
    ['BOOM500', 'BOOM500'],
    ['BOOM1000', 'BOOM1000'],
    ['CRASH300N', 'CRASH300'],
    ['CRASH500', 'CRASH500'],
    ['CRASH1000', 'CRASH1000'],
  ] as const) {
    add(prefix, canonical);
    add(`${prefix}INDEX`, canonical);
    add(`${prefix}N`, canonical);
  }

  for (const n of [10, 25, 50, 75, 100, 150, 200]) {
    add(`JD${n}`, `JD${n}`);
    add(`JUMP${n}`, `JD${n}`);
    add(`JUMP${n}INDEX`, `JD${n}`);
  }

  add('STEP', 'STPRNG');
  add('STEPINDEX', 'STPRNG');
  add('STP', 'STPRNG');
  add('BEAR', 'RDBEAR');
  add('BEARMARKET', 'RDBEAR');
  add('BEARMARKETINDEX', 'RDBEAR');
  add('BULL', 'RDBULL');
  add('BULLMARKET', 'RDBULL');
  add('BULLMARKETINDEX', 'RDBULL');

  // Generic MT5 / TradingView names
  add('GOLD', 'XAUUSD');
  add('XAUUSD', 'XAUUSD');
  add('SILVER', 'XAGUSD');
  add('XAGUSD', 'XAGUSD');
  add('NAS100', 'NAS100');
  add('NASDAQ', 'NAS100');
  add('US30', 'US30');
  add('US500', 'US500');
  add('UK100', 'UK100');
  add('GER40', 'GER40');
  add('BTCUSD', 'BTCUSD');
  add('ETHUSD', 'ETHUSD');

  // Strip FRX prefix aliases (some charts show EURUSD, broker uses FRXEURUSD)
  for (const canonical of Object.keys(DERIV_MT5_DISPLAY_NAMES)) {
    if (canonical.startsWith('FRX') && canonical.length > 3) {
      add(canonical.slice(3), canonical);
    }
  }

  return map;
}

const ALIAS_TO_CANONICAL = buildAliasMap();

const DISPLAY_PATTERNS: ReadonlyArray<{ re: RegExp; symbol: string }> = [
  { re: /VOLATILITY\s*10\s*\(\s*1\s*S\s*\)/i, symbol: '1HZ10V' },
  { re: /VOLATILITY\s*15\s*\(\s*1\s*S\s*\)/i, symbol: '1HZ15V' },
  { re: /VOLATILITY\s*25\s*\(\s*1\s*S\s*\)/i, symbol: '1HZ25V' },
  { re: /VOLATILITY\s*30\s*\(\s*1\s*S\s*\)/i, symbol: '1HZ30V' },
  { re: /VOLATILITY\s*50\s*\(\s*1\s*S\s*\)/i, symbol: '1HZ50V' },
  { re: /VOLATILITY\s*75\s*\(\s*1\s*S\s*\)/i, symbol: '1HZ75V' },
  { re: /VOLATILITY\s*90\s*\(\s*1\s*S\s*\)/i, symbol: '1HZ90V' },
  { re: /VOLATILITY\s*100\s*\(\s*1\s*S\s*\)/i, symbol: '1HZ100V' },
  { re: /VOLATILITY\s*150\s*\(\s*1\s*S\s*\)/i, symbol: '1HZ150V' },
  { re: /VOLATILITY\s*200\s*\(\s*1\s*S\s*\)/i, symbol: '1HZ200V' },
  { re: /VOLATILITY\s*250\s*\(\s*1\s*S\s*\)/i, symbol: '1HZ250V' },
  { re: /VOLATILITY\s*300\s*\(\s*1\s*S\s*\)/i, symbol: '1HZ300V' },
  { re: /VOLATILITY\s*10(?!\s*\(\s*1\s*S)/i, symbol: 'R_10' },
  { re: /VOLATILITY\s*25(?!\s*\(\s*1\s*S)/i, symbol: 'R_25' },
  { re: /VOLATILITY\s*50(?!\s*\(\s*1\s*S)/i, symbol: 'R_50' },
  { re: /VOLATILITY\s*75(?!\s*\(\s*1\s*S)/i, symbol: 'R_75' },
  { re: /VOLATILITY\s*100(?!\s*\(\s*1\s*S)/i, symbol: 'R_100' },
  { re: /BOOM\s*300/i, symbol: 'BOOM300N' },
  { re: /BOOM\s*500/i, symbol: 'BOOM500' },
  { re: /BOOM\s*1000/i, symbol: 'BOOM1000' },
  { re: /CRASH\s*300/i, symbol: 'CRASH300N' },
  { re: /CRASH\s*500/i, symbol: 'CRASH500' },
  { re: /CRASH\s*1000/i, symbol: 'CRASH1000' },
  { re: /STEP\s*INDEX/i, symbol: 'STPRNG' },
  { re: /BEAR\s*MARKET/i, symbol: 'RDBEAR' },
  { re: /BULL\s*MARKET/i, symbol: 'RDBULL' },
];

function has1sMarker(key: string, raw: string): boolean {
  return (
    /1S|1HZ|HZ\d+V/.test(key) ||
    /\(\s*1\s*s\s*\)/i.test(raw) ||
    /\b1\s*sec(ond)?\b/i.test(raw)
  );
}

function hasStandardVolMarker(key: string, raw: string): boolean {
  return (
    /^R_\d+$/.test(key) ||
    (/VOLATILITY/i.test(raw) && !/\(\s*1\s*s\s*\)/i.test(raw) && !/1S/.test(key))
  );
}

/**
 * Resolve user/chart input to the canonical Deriv MT5 symbol code.
 */
export function normalizeDerivSymbol(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const key = normalizeSymbolKey(trimmed);
  if (ALIAS_TO_CANONICAL[key]) return ALIAS_TO_CANONICAL[key];

  for (const { re, symbol } of DISPLAY_PATTERNS) {
    if (re.test(trimmed)) return symbol;
  }

  const jumpMatch = trimmed.match(/JUMP\s*(\d+)/i);
  if (jumpMatch) return `JD${jumpMatch[1]}`;

  const vol1s = key.match(/^VOLATILITY(\d+)1S(?:INDEX)?$/);
  if (vol1s) return `1HZ${vol1s[1]}V`;

  const volStd = key.match(/^VOLATILITY(\d+)(?:INDEX)?$/);
  if (volStd && !has1sMarker(key, trimmed)) return `R_${volStd[1]}`;

  const hzBare = key.match(/^HZ(\d+)V$/);
  if (hzBare) return `1HZ${hzBare[1]}V`;

  if (/^1HZ\d+V$/.test(key)) return key;
  if (/^R_\d+$/.test(key)) return key;
  if (/^(BOOM|CRASH)\d+N?$/.test(key)) {
    const m = key.match(/^(BOOM|CRASH)(\d+)N?$/);
    if (m) {
      const suffix = m[1] === 'BOOM' && m[2] === '300' ? 'N' : '';
      return `${m[1]}${m[2]}${suffix}`;
    }
  }
  if (/^JD\d+$/.test(key)) return key;

  return trimmed.toUpperCase().replace(/\s+/g, '');
}

/**
 * Ordered symbol codes to try when fetching live prices (MetaAPI / Signal Hub).
 * Avoids mixing 1s vs standard volatility unless input was ambiguous.
 */
export function getSymbolLookupVariants(raw: string): string[] {
  const trimmed = raw.trim();
  const key = normalizeSymbolKey(trimmed);
  const canonical = normalizeDerivSymbol(trimmed);
  const variants: string[] = [];
  const seen = new Set<string>();

  const push = (value: string) => {
    const v = value.trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    variants.push(v);
  };

  push(canonical);
  push(trimmed.toUpperCase());

  if (ALIAS_TO_CANONICAL[key] && ALIAS_TO_CANONICAL[key] !== canonical) {
    push(ALIAS_TO_CANONICAL[key]);
  }

  const ambiguousVol = key.match(/^(?:V|VOL|VIX)(\d+)$/);
  if (ambiguousVol && !has1sMarker(key, trimmed) && !hasStandardVolMarker(key, trimmed)) {
    const n = ambiguousVol[1];
    push(`1HZ${n}V`);
    push(`R_${n}`);
  }

  const volOnly = key.match(/^VOLATILITY(\d+)$/);
  if (volOnly && !has1sMarker(key, trimmed)) {
    push(`1HZ${volOnly[1]}V`);
    push(`R_${volOnly[1]}`);
  }

  return variants;
}

export function getDerivDisplayName(symbol: string): string | undefined {
  const canonical = normalizeDerivSymbol(symbol);
  return DERIV_MT5_DISPLAY_NAMES[canonical];
}
