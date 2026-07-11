import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../email/notification.service';
import {
  validateWithdrawalWalletAddress,
  WITHDRAWAL_WALLET_NETWORKS,
} from '../common/payout.util';
import { isMomoWithdrawalNetwork } from '../flutterwave/flutterwave.constants';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const MAX_WALLETS_PER_USER = 10;

@Injectable()
export class SavedWithdrawalWalletService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  list(userId: string) {
    return this.prisma.savedWithdrawalWallet.findMany({
      where: { userId },
      orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        label: true,
        address: true,
        network: true,
        verifiedAt: true,
        createdAt: true,
      },
    });
  }

  async requestVerification(
    userId: string,
    input: { label: string; address: string; network: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, status: true },
    });
    if (!user?.email?.trim()) {
      throw new BadRequestException('Add an email address to your account first');
    }
    if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
      throw new BadRequestException('Account cannot add withdrawal wallets');
    }

    const label = input.label.trim();
    const network = input.network.trim().toUpperCase();
    const address = input.address.trim();

    if (!label || label.length < 2) {
      throw new BadRequestException('Enter a wallet description (at least 2 characters)');
    }
    if (label.length > 64) {
      throw new BadRequestException('Description is too long (max 64 characters)');
    }
    if (!WITHDRAWAL_WALLET_NETWORKS.includes(network as (typeof WITHDRAWAL_WALLET_NETWORKS)[number])) {
      throw new BadRequestException(
        `Choose a network: ${WITHDRAWAL_WALLET_NETWORKS.join(', ')}`,
      );
    }

    validateWithdrawalWalletAddress(network, address);

    const count = await this.prisma.savedWithdrawalWallet.count({
      where: { userId },
    });
    if (count >= MAX_WALLETS_PER_USER) {
      throw new BadRequestException(
        `You can save up to ${MAX_WALLETS_PER_USER} withdrawal wallets`,
      );
    }

    const existing = await this.prisma.savedWithdrawalWallet.findUnique({
      where: {
        userId_address_network: { userId, address, network },
      },
    });
    if (existing) {
      throw new BadRequestException('This wallet is already saved on that network');
    }

    const recent = await this.prisma.withdrawalWalletOtp.findFirst({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (
      recent &&
      Date.now() - recent.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS
    ) {
      const waitSec = Math.ceil(
        (OTP_RESEND_COOLDOWN_MS - (Date.now() - recent.createdAt.getTime())) /
          1000,
      );
      throw new BadRequestException(
        `Wait ${waitSec}s before requesting another verification code`,
      );
    }

    await this.prisma.withdrawalWalletOtp.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const email = user.email.trim().toLowerCase();
    const code = String(randomInt(100000, 999999));
    const codeHash = await bcrypt.hash(code, 10);

    const session = await this.prisma.withdrawalWalletOtp.create({
      data: {
        userId,
        email,
        codeHash,
        label,
        address,
        network,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    const emailSent = await this.notifications.withdrawalWalletVerify(
      email,
      code,
      { label, address, network },
    );
    if (!emailSent) {
      await this.prisma.withdrawalWalletOtp.update({
        where: { id: session.id },
        data: { usedAt: new Date() },
      });
      throw new ServiceUnavailableException(
        'Could not send verification email. Try again shortly.',
      );
    }

    return {
      sessionId: session.id,
      email,
      network,
      message: 'Check your email for a 6-digit verification code',
      expiresIn: OTP_TTL_MS / 1000,
    };
  }

  async confirmVerification(userId: string, sessionId: string, code: string) {
    const session = await this.prisma.withdrawalWalletOtp.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId || session.usedAt) {
      throw new BadRequestException('Invalid or expired verification session');
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Verification code expired — request a new one');
    }
    if (session.attempts >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException('Too many attempts — request a new code');
    }

    const valid = await bcrypt.compare(code.trim(), session.codeHash);
    if (!valid) {
      await this.prisma.withdrawalWalletOtp.update({
        where: { id: session.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Incorrect verification code');
    }

    validateWithdrawalWalletAddress(session.network, session.address);

    const wallet = await this.prisma.$transaction(async (tx) => {
      await tx.withdrawalWalletOtp.update({
        where: { id: session.id },
        data: { usedAt: new Date() },
      });

      return tx.savedWithdrawalWallet.create({
        data: {
          userId,
          label: session.label,
          address: session.address,
          network: session.network,
        },
        select: {
          id: true,
          label: true,
          address: true,
          network: true,
          verifiedAt: true,
          createdAt: true,
        },
      });
    });

    return {
      wallet,
      message: 'Withdrawal wallet saved',
    };
  }

  async getForWithdraw(userId: string, walletId: string) {
    const wallet = await this.prisma.savedWithdrawalWallet.findFirst({
      where: { id: walletId, userId },
    });
    if (!wallet) {
      throw new NotFoundException('Saved withdrawal wallet not found');
    }
    if (wallet.network !== 'TRC20' && !isMomoWithdrawalNetwork(wallet.network)) {
      throw new BadRequestException(
        'Withdrawals support TRC20 USDT or saved Mobile Money wallets',
      );
    }
    return wallet;
  }

  async remove(userId: string, walletId: string) {
    const wallet = await this.prisma.savedWithdrawalWallet.findFirst({
      where: { id: walletId, userId },
    });
    if (!wallet) {
      throw new NotFoundException('Saved withdrawal wallet not found');
    }

    await this.prisma.savedWithdrawalWallet.delete({ where: { id: wallet.id } });
    return { ok: true, message: 'Withdrawal wallet removed' };
  }
}
