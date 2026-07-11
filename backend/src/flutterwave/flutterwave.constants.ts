export const FLW_GATEWAY = 'Flutterwave';

/** Minimum MoMo charge amount in USD (wallet credited in USDT). */
export const FLW_DEFAULT_MIN_DEPOSIT_USD = 3;

export const FLW_TOKEN_URL =
  'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token';

export const FLW_DEFAULT_API_URL = 'https://f4bexperience.flutterwave.com';

export const FLW_SANDBOX_API_URL = 'https://developersandbox-api.flutterwave.com';

export const MOMO_WITHDRAWAL_NETWORKS = ['MOMO_MTN', 'MOMO_AIRTEL'] as const;

export type MomoWithdrawalNetwork = (typeof MOMO_WITHDRAWAL_NETWORKS)[number];

export const MOMO_CHARGE_NETWORKS = [
  { id: 'MTN', label: 'MTN MoMo' },
  { id: 'AIRTEL', label: 'Airtel Money' },
] as const;

export function momoNetworkFromSavedWallet(network: string): string {
  const n = network.trim().toUpperCase();
  if (n === 'MOMO_MTN') return 'MTN';
  if (n === 'MOMO_AIRTEL') return 'AIRTEL';
  return n.replace(/^MOMO_/, '');
}

export function isMomoWithdrawalNetwork(network: string): boolean {
  return MOMO_WITHDRAWAL_NETWORKS.includes(
    network.trim().toUpperCase() as MomoWithdrawalNetwork,
  );
}
