import { BadRequestException } from '@nestjs/common';
import { PayoutMethod } from '@prisma/client';

const TRC20_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const EVM_REGEX = /^0x[a-fA-F0-9]{40}$/;

export const WITHDRAWAL_WALLET_NETWORKS = [
  'TRC20',
  'ERC20',
  'BEP20',
  'MOMO_MTN',
  'MOMO_AIRTEL',
] as const;
export type WithdrawalWalletNetwork = (typeof WITHDRAWAL_WALLET_NETWORKS)[number];

export function isValidTrc20Address(address: string): boolean {
  return TRC20_REGEX.test(address.trim());
}

export function isValidEvmAddress(address: string): boolean {
  return EVM_REGEX.test(address.trim());
}

export function validateWithdrawalWalletAddress(
  network: string,
  address: string,
): void {
  const normalizedNetwork = network.trim().toUpperCase();
  const trimmed = address.trim();

  if (normalizedNetwork === 'TRC20') {
    if (!isValidTrc20Address(trimmed)) {
      throw new BadRequestException('Enter a valid USDT TRC20 address (starts with T, 34 characters)');
    }
    return;
  }

  if (normalizedNetwork === 'ERC20' || normalizedNetwork === 'BEP20') {
    if (!isValidEvmAddress(trimmed)) {
      throw new BadRequestException(`Enter a valid ${normalizedNetwork} wallet address (0x…)`);
    }
    return;
  }

  if (normalizedNetwork === 'MOMO_MTN' || normalizedNetwork === 'MOMO_AIRTEL') {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 12) {
      throw new BadRequestException('Enter a valid mobile money phone number (8–12 digits)');
    }
    return;
  }

  throw new BadRequestException(
    `Unsupported network. Choose one of: ${WITHDRAWAL_WALLET_NETWORKS.join(', ')}`,
  );
}

export function formatMobileMoneyDestination(
  provider: string,
  number: string,
  accountName?: string | null,
): string {
  const label = provider.trim();
  const phone = number.trim();
  const name = accountName?.trim();
  return name ? `${label}: ${phone} (${name})` : `${label}: ${phone}`;
}

export function resolvePayoutDestination(
  profile: {
    payoutMethod: PayoutMethod | null;
    trc20Address: string | null;
    mobileMoneyProvider: string | null;
    mobileMoneyNumber: string | null;
    mobileMoneyAccountName: string | null;
  } | null,
  override?: string,
): { destination: string; method: PayoutMethod } {
  const trimmedOverride = override?.trim();
  if (trimmedOverride) {
    if (isValidTrc20Address(trimmedOverride)) {
      return { destination: trimmedOverride, method: 'TRC20' };
    }
    if (trimmedOverride.length >= 8) {
      return { destination: trimmedOverride, method: 'MOBILE_MONEY' };
    }
    throw new BadRequestException('Enter a valid TRC20 address or mobile money details');
  }

  if (!profile?.payoutMethod) {
    throw new BadRequestException(
      'Set your payout method in Settings before requesting a payout',
    );
  }

  if (profile.payoutMethod === 'TRC20') {
    const address = profile.trc20Address?.trim();
    if (!address || !isValidTrc20Address(address)) {
      throw new BadRequestException('Add a valid USDT TRC20 address in Settings');
    }
    return { destination: address, method: 'TRC20' };
  }

  const provider = profile.mobileMoneyProvider?.trim();
  const number = profile.mobileMoneyNumber?.trim();
  if (!provider || !number || number.length < 8) {
    throw new BadRequestException(
      'Add your mobile money provider and number in Settings',
    );
  }

  return {
    destination: formatMobileMoneyDestination(
      provider,
      number,
      profile.mobileMoneyAccountName,
    ),
    method: 'MOBILE_MONEY',
  };
}
