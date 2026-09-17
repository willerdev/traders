/**
 * Daily investor credits run at a fixed platform clock (East Africa).
 * User-facing copy must never name Kampala — show the user's local country time instead.
 */

export const PLATFORM_DAILY_CREDIT_TZ = "Africa/Kampala";
export const PLATFORM_DAILY_CREDIT_HOUR = 16;
export const PLATFORM_DAILY_CREDIT_MINUTE = 0;

/** Common profile country strings / ISO-2 → IANA timezone. */
const COUNTRY_TO_TIMEZONE: Record<string, string> = {
  RW: "Africa/Kigali",
  RWANDA: "Africa/Kigali",
  UG: "Africa/Kampala",
  UGANDA: "Africa/Kampala",
  KE: "Africa/Nairobi",
  KENYA: "Africa/Nairobi",
  TZ: "Africa/Dar_es_Salaam",
  TANZANIA: "Africa/Dar_es_Salaam",
  BI: "Africa/Bujumbura",
  BURUNDI: "Africa/Bujumbura",
  CD: "Africa/Kinshasa",
  "DR CONGO": "Africa/Kinshasa",
  "DEMOCRATIC REPUBLIC OF THE CONGO": "Africa/Kinshasa",
  CG: "Africa/Brazzaville",
  CONGO: "Africa/Brazzaville",
  NG: "Africa/Lagos",
  NIGERIA: "Africa/Lagos",
  GH: "Africa/Accra",
  GHANA: "Africa/Accra",
  ZA: "Africa/Johannesburg",
  "SOUTH AFRICA": "Africa/Johannesburg",
  EG: "Africa/Cairo",
  EGYPT: "Africa/Cairo",
  ET: "Africa/Addis_Ababa",
  ETHIOPIA: "Africa/Addis_Ababa",
  CM: "Africa/Douala",
  CAMEROON: "Africa/Douala",
  SN: "Africa/Dakar",
  SENEGAL: "Africa/Dakar",
  CI: "Africa/Abidjan",
  "COTE D'IVOIRE": "Africa/Abidjan",
  "CÔTE D'IVOIRE": "Africa/Abidjan",
  AE: "Asia/Dubai",
  "UNITED ARAB EMIRATES": "Asia/Dubai",
  US: "America/New_York",
  USA: "America/New_York",
  "UNITED STATES": "America/New_York",
  "UNITED STATES OF AMERICA": "America/New_York",
  GB: "Europe/London",
  UK: "Europe/London",
  "UNITED KINGDOM": "Europe/London",
  IN: "Asia/Kolkata",
  INDIA: "Asia/Kolkata",
  PH: "Asia/Manila",
  PHILIPPINES: "Asia/Manila",
  CN: "Asia/Shanghai",
  CHINA: "Asia/Shanghai",
  AU: "Australia/Sydney",
  AUSTRALIA: "Australia/Sydney",
  CA: "America/Toronto",
  CANADA: "America/Toronto",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  ZM: "Africa/Lusaka",
  ZAMBIA: "Africa/Lusaka",
  MW: "Africa/Blantyre",
  MALAWI: "Africa/Blantyre",
  MZ: "Africa/Maputo",
  MOZAMBIQUE: "Africa/Maputo",
};

function normalizeCountryKey(country: string | null | undefined): string | null {
  if (!country?.trim()) return null;
  return country.trim().toUpperCase().replace(/\s+/g, " ");
}

export function timezoneFromCountry(
  country: string | null | undefined,
): string | null {
  const key = normalizeCountryKey(country);
  if (!key) return null;
  return COUNTRY_TO_TIMEZONE[key] ?? null;
}

export function resolveDisplayTimezone(country?: string | null): string {
  const fromCountry = timezoneFromCountry(country);
  if (fromCountry) return fromCountry;
  if (typeof Intl !== "undefined") {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      /* ignore */
    }
  }
  return "UTC";
}

export function formatCountryLabel(
  country: string | null | undefined,
): string | null {
  if (!country?.trim()) return null;
  const raw = country.trim();
  if (raw.length <= 3 && raw === raw.toUpperCase()) return raw.toUpperCase();
  return raw.replace(
    /\w\S*/g,
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );
}

function wallClockMinutes(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  // en-US hour12:false can yield "24" for midnight in some engines
  const h = hour === 24 ? 0 : hour;
  return h * 60 + minute;
}

/** Absolute instant for today's platform daily-credit wall clock. */
export function platformDailyCreditInstant(now = new Date()): Date {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: PLATFORM_DAILY_CREDIT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(dateParts.find((p) => p.type === "year")?.value);
  const m = Number(dateParts.find((p) => p.type === "month")?.value);
  const d = Number(dateParts.find((p) => p.type === "day")?.value);

  const desired =
    PLATFORM_DAILY_CREDIT_HOUR * 60 + PLATFORM_DAILY_CREDIT_MINUTE;
  // Start near midday UTC on that calendar date, then correct to 16:00 platform TZ
  let ms = Date.UTC(y, m - 1, d, 12, 0, 0);
  for (let i = 0; i < 5; i++) {
    const diff = desired - wallClockMinutes(ms, PLATFORM_DAILY_CREDIT_TZ);
    if (diff === 0) break;
    ms += diff * 60_000;
  }
  return new Date(ms);
}

export function formatPlatformCreditClock(opts?: {
  country?: string | null;
  timeZone?: string;
  locale?: string;
}): { time: string; zoneLabel: string; timeZone: string } {
  const timeZone = opts?.timeZone ?? resolveDisplayTimezone(opts?.country);
  const locale =
    opts?.locale ??
    (typeof navigator !== "undefined" ? navigator.language : "en-US");
  const instant = platformDailyCreditInstant();
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);

  const countryLabel = formatCountryLabel(opts?.country);
  const zoneLabel = countryLabel
    ? `${countryLabel} local time`
    : "your local country time";

  return { time, zoneLabel, timeZone };
}

/** Short inline hint: "~4:00 PM Rwanda local time" */
export function dailyCreditTimeShort(country?: string | null): string {
  const { time, zoneLabel } = formatPlatformCreditClock({ country });
  return `~${time} ${zoneLabel}`;
}

/** Sentence fragment: "around 4:00 PM your local country time" */
export function dailyCreditTimeAround(country?: string | null): string {
  const { time, zoneLabel } = formatPlatformCreditClock({ country });
  return `around ${time} ${zoneLabel}`;
}
