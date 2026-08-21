export const AIRFARMING_SETTINGS_ID = 'default';

export const DEFAULT_DROP_BANDS = [
  { bandIndex: 0, label: 'Starter A', minBalance: 100, maxBalance: 145, percent: 12 },
  { bandIndex: 1, label: 'Starter B', minBalance: 100, maxBalance: 112, percent: 10 },
  { bandIndex: 2, label: 'Growth', minBalance: 1000, maxBalance: 2400, percent: 22 },
  { bandIndex: 3, label: 'Premium', minBalance: 10000, maxBalance: 16000, percent: 30 },
] as const;

export const CATCHUP_DROP_INDEX = 9000;
