/**
 * Deriv MT5 / API symbol codes and common display-name / shorthand aliases.
 * Volatility standard (R_*) and 1-second (1HZ*V) indices are fully mapped.
 * Source: deriv-com/deriv-app active_symbols, Deriv academy symbol sheets.
 */

/** Standard volatility levels (2s tick) — MT5 codes R_10 … R_100. */
export const VOL_STD_LEVELS = [10, 25, 50, 75, 100] as const;

/** 1-second volatility levels — MT5 codes 1HZ10V … 1HZ300V. */
export const VOL_1S_LEVELS = [
  10, 15, 25, 30, 50, 75, 90, 100, 150, 200, 250, 300,
] as const;

export type VolStdLevel = (typeof VOL_STD_LEVELS)[number];
export type Vol1sLevel = (typeof VOL_1S_LEVELS)[number];

export function volStdCode(level: number): string {
  return `R_${level}`;
}

export function vol1sCode(level: number): string {
  return `1HZ${level}V`;
}

export function volStdDisplay(level: number): string {
  return `Volatility ${level} Index`;
}

export function vol1sDisplay(level: number): string {
  return `Volatility ${level} (1s) Index`;
}

/** One row per volatility level with both standard and 1s where Deriv offers them. */
export type VolatilitySymbolEntry = {
  level: number;
  standardCode?: string;
  standardDisplay?: string;
  oneSecondCode: string;
  oneSecondDisplay: string;
};

export function buildVolatilityRegistry(): VolatilitySymbolEntry[] {
  const levels = new Set([...VOL_STD_LEVELS, ...VOL_1S_LEVELS]);
  return [...levels]
    .sort((a, b) => a - b)
    .map((level) => ({
      level,
      standardCode: VOL_STD_LEVELS.includes(level as VolStdLevel)
        ? volStdCode(level)
        : undefined,
      standardDisplay: VOL_STD_LEVELS.includes(level as VolStdLevel)
        ? volStdDisplay(level)
        : undefined,
      oneSecondCode: vol1sCode(level),
      oneSecondDisplay: vol1sDisplay(level),
    }));
}

export const VOLATILITY_SYMBOL_REGISTRY = buildVolatilityRegistry();

function buildVolatilityDisplayNames(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of VOLATILITY_SYMBOL_REGISTRY) {
    out[row.oneSecondCode] = row.oneSecondDisplay;
    if (row.standardCode && row.standardDisplay) {
      out[row.standardCode] = row.standardDisplay;
    }
  }
  return out;
}

/** Official MT5 symbol → Deriv display name. */
export const DERIV_MT5_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  ...buildVolatilityDisplayNames(),
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

  for (const row of VOLATILITY_SYMBOL_REGISTRY) {
    const { level, oneSecondCode, standardCode } = row;
    const n = String(level);

    // —— 1-second volatility ——
    add(oneSecondCode, oneSecondCode);
    add(`HZ${n}V`, oneSecondCode);
    add(`VIX${n}1S`, oneSecondCode);
    add(`VIX${n}S`, oneSecondCode);
    add(`VOLATILITY${n}1S`, oneSecondCode);
    add(`VOLATILITY${n}1SINDEX`, oneSecondCode);
    add(`VOL${n}1S`, oneSecondCode);
    add(`V${n}1S`, oneSecondCode);
    add(`V${n}S`, oneSecondCode);
    add(`${n}S`, oneSecondCode);
    add(`${n}1S`, oneSecondCode);
    add(`V${n}1SEC`, oneSecondCode);
    add(`VOL${n}1SEC`, oneSecondCode);
    // Common shorthand V75 → 1s on Deriv MT5
    add(`V${n}`, oneSecondCode);
    add(`VOL${n}`, oneSecondCode);
    add(`VIX${n}`, oneSecondCode);

    // —— Standard volatility (2s) ——
    if (standardCode) {
      add(standardCode, standardCode);
      add(`R${n}`, standardCode);
      add(`VOLATILITY${n}`, standardCode);
      add(`VOLATILITY${n}INDEX`, standardCode);
      add(`V${n}INDEX`, standardCode);
      add(`V${n}STD`, standardCode);
      add(`VOL${n}STD`, standardCode);
      add(`STANDARDVOLATILITY${n}`, standardCode);
      add(`STANDARDV${n}`, standardCode);
    }
  }

  // Explicit disambiguation: "volatility 10 index" (no 1s) → standard
  for (const n of VOL_STD_LEVELS) {
    add(`VOLATILITY${n}STANDARD`, volStdCode(n));
    add(`VOLATILITY${n}2S`, volStdCode(n));
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

  for (const canonical of Object.keys(DERIV_MT5_DISPLAY_NAMES)) {
    if (canonical.startsWith('FRX') && canonical.length > 3) {
      add(canonical.slice(3), canonical);
    }
  }

  return map;
}

const ALIAS_TO_CANONICAL = buildAliasMap();

function buildDisplayPatterns(): ReadonlyArray<{ re: RegExp; symbol: string }> {
  const patterns: Array<{ re: RegExp; symbol: string }> = [];

  for (const n of VOL_1S_LEVELS) {
    patterns.push({
      re: new RegExp(`VOLATILITY\\s*${n}\\s*\\(\\s*1\\s*S\\s*\\)`, 'i'),
      symbol: vol1sCode(n),
    });
    patterns.push({
      re: new RegExp(`\\bV${n}\\s*1\\s*S\\b`, 'i'),
      symbol: vol1sCode(n),
    });
    patterns.push({
      re: new RegExp(`\\bVOL${n}\\s*1\\s*S\\b`, 'i'),
      symbol: vol1sCode(n),
    });
  }

  for (const n of VOL_STD_LEVELS) {
    patterns.push({
      re: new RegExp(`VOLATILITY\\s*${n}(?!\\s*\\(\\s*1\\s*S)(?!\\s*1\\s*S)`, 'i'),
      symbol: volStdCode(n),
    });
  }

  return [
    ...patterns,
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
}

const DISPLAY_PATTERNS = buildDisplayPatterns();

function has1sMarker(key: string, raw: string): boolean {
  return (
    /1S|1HZ|HZ\d+V/.test(key) ||
    /\(\s*1\s*s\s*\)/i.test(raw) ||
    /\b1\s*s(ec(ond)?)?\b/i.test(raw)
  );
}

function hasStandardVolMarker(key: string, raw: string): boolean {
  return (
    /^R_\d+$/.test(key) ||
    /STANDARD|2S/.test(key) ||
    (/VOLATILITY/i.test(raw) &&
      !/\(\s*1\s*s\s*\)/i.test(raw) &&
      !/\b1\s*s\b/i.test(raw) &&
      !/1S/.test(key))
  );
}

function registryRowForLevel(level: number): VolatilitySymbolEntry | undefined {
  return VOLATILITY_SYMBOL_REGISTRY.find((r) => r.level === level);
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
  if (vol1s) return vol1sCode(Number(vol1s[1]));

  const volStd = key.match(/^VOLATILITY(\d+)(?:INDEX|STANDARD|2S)?$/);
  if (volStd && !has1sMarker(key, trimmed)) {
    const level = Number(volStd[1]);
    if (VOL_STD_LEVELS.includes(level as VolStdLevel)) {
      return volStdCode(level);
    }
  }

  const hzBare = key.match(/^HZ(\d+)V$/);
  if (hzBare) return vol1sCode(Number(hzBare[1]));

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
 * Includes MT5 codes and broker display names (e.g. Volatility 10 (1s) Index).
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
  push(trimmed);

  if (ALIAS_TO_CANONICAL[key] && ALIAS_TO_CANONICAL[key] !== canonical) {
    push(ALIAS_TO_CANONICAL[key]);
  }

  const displayName = getDerivDisplayName(canonical);
  if (displayName) push(displayName);

  // If input looks like a volatility level, include both 1s + standard variants
  const levelFromKey =
    key.match(/^(?:V|VOL|VIX|R_?)(\d+)(?:1S|S|STD|INDEX)?$/) ??
    key.match(/^1HZ(\d+)V$/) ??
    key.match(/^HZ(\d+)V$/) ??
    key.match(/^VOLATILITY(\d+)/);
  if (levelFromKey) {
    const level = Number(levelFromKey[1]);
    const row = registryRowForLevel(level);
    if (row) {
      push(row.oneSecondCode);
      push(row.oneSecondDisplay);
      if (row.standardCode && row.standardDisplay) {
        push(row.standardCode);
        push(row.standardDisplay);
      }
    }
  }

  const ambiguousVol = key.match(/^(?:V|VOL|VIX)(\d+)$/);
  if (
    ambiguousVol &&
    !has1sMarker(key, trimmed) &&
    !hasStandardVolMarker(key, trimmed)
  ) {
    const level = Number(ambiguousVol[1]);
    const row = registryRowForLevel(level);
    if (row) {
      push(row.oneSecondCode);
      push(row.oneSecondDisplay);
      if (row.standardCode) {
        push(row.standardCode);
        if (row.standardDisplay) push(row.standardDisplay);
      }
    }
  }

  const volOnly = key.match(/^VOLATILITY(\d+)$/);
  if (volOnly && !has1sMarker(key, trimmed)) {
    const level = Number(volOnly[1]);
    const row = registryRowForLevel(level);
    if (row) {
      push(row.oneSecondCode);
      push(row.oneSecondDisplay);
      if (row.standardCode) {
        push(row.standardCode);
        if (row.standardDisplay) push(row.standardDisplay);
      }
    }
  }

  return variants;
}

export function getDerivDisplayName(symbol: string): string | undefined {
  const canonical = normalizeDerivSymbol(symbol);
  return DERIV_MT5_DISPLAY_NAMES[canonical];
}

/** All mapped volatility pairs for admin/debug or UI pickers. */
export function listVolatilitySymbols(): VolatilitySymbolEntry[] {
  return VOLATILITY_SYMBOL_REGISTRY;
}
