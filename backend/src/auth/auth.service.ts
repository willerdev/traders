import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  RegisterDto,
  LoginDto,
  WalletLoginDto,
  VerifyLoginOtpDto,
  ResendLoginOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '../common/dto';
import { assertAllowedDisplayName } from '../common/display-name.util';
import {
  isRegistrationEmailAllowed,
  REGISTRATION_EMAIL_REJECTED_MESSAGE,
} from '../common/email-quality.util';
import {
  MAX_RISK_PER_TRADE,
  RISK_PERCENT,
  STARTING_BALANCE,
} from '../common/constants';
import { randomBytes, randomInt, createHash } from 'crypto';
import { verifyMessage } from 'viem';
import { NotificationService } from '../email/notification.service';
import { ReferralsService } from '../referrals/referrals.service';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

const PASSWORD_RESET_GENERIC_MESSAGE =
  'If an account exists for that email, we sent password reset instructions.';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private notifications: NotificationService,
    private referrals: ReferralsService,
  ) {}

  async register(dto: RegisterDto, ip?: string) {
    const email = dto.email.trim().toLowerCase();

    if (!isRegistrationEmailAllowed(email)) {
      throw new BadRequestException(REGISTRATION_EMAIL_REJECTED_MESSAGE);
    }

    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const emailVerifyToken = randomBytes(32).toString('hex');

    const displayName = assertAllowedDisplayName(dto.displayName);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
        emailVerifyToken,
        lastLoginIp: ip,
        termsAcceptedAt: new Date(),
        status: 'PENDING_PAYMENT',
      },
    });

    if (dto.referralCode) {
      await this.referrals
        .attachReferral(user.id, dto.referralCode)
        .catch(() => undefined);
    }

    return {
      user: this.sanitizeUser(user),
      message:
        'Registration successful. Sign in and pay the registration fee to start trading.',
    };
  }

  async login(dto: LoginDto, ip?: string) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account is not allowed to sign in');
    }

    if (user.role === 'ADMIN') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginIp: ip, emailVerified: true },
      });
      return this.generateToken(user);
    }

    await this.prisma.loginOtp.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = String(randomInt(100000, 999999));
    const codeHash = await bcrypt.hash(code, 10);

    const session = await this.prisma.loginOtp.create({
      data: {
        userId: user.id,
        email,
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    const emailSent = await this.notifications.loginOtp(email, code);
    if (!emailSent) {
      await this.prisma.loginOtp.update({
        where: { id: session.id },
        data: { usedAt: new Date() },
      });
      throw new ServiceUnavailableException(
        'Could not send sign-in code email. Try again shortly or contact support.',
      );
    }

    if (ip) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginIp: ip },
      });
    }

    return {
      requiresOtp: true as const,
      loginSessionId: session.id,
      email,
      message: 'Check your email for a 6-digit sign-in code',
      expiresIn: OTP_TTL_MS / 1000,
    };
  }

  async verifyLoginOtp(dto: VerifyLoginOtpDto) {
    const session = await this.prisma.loginOtp.findUnique({
      where: { id: dto.loginSessionId },
    });

    if (!session || session.usedAt) {
      throw new UnauthorizedException('Invalid or expired sign-in session');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Sign-in code expired — sign in again');
    }

    if (session.attempts >= OTP_MAX_ATTEMPTS) {
      throw new HttpException(
        'Too many attempts — sign in again',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = dto.code.trim();
    const valid = await bcrypt.compare(code, session.codeHash);
    if (!valid) {
      await this.prisma.loginOtp.update({
        where: { id: session.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid sign-in code');
    }

    await this.prisma.loginOtp.update({
      where: { id: session.id },
      data: { usedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    return this.generateToken(user);
  }

  async resendLoginOtp(dto: ResendLoginOtpDto) {
    const session = await this.prisma.loginOtp.findUnique({
      where: { id: dto.loginSessionId },
    });

    if (!session || session.usedAt) {
      throw new UnauthorizedException('Invalid or expired sign-in session');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Sign-in session expired — sign in again');
    }

    const lastSentAt = session.expiresAt.getTime() - OTP_TTL_MS;
    const elapsed = Date.now() - lastSentAt;
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw new HttpException(
        `Wait ${waitSec}s before requesting another code`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(100000, 999999));
    const codeHash = await bcrypt.hash(code, 10);

    const refreshed = await this.prisma.loginOtp.update({
      where: { id: session.id },
      data: {
        codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    const emailSent = await this.notifications.loginOtp(session.email, code);
    if (!emailSent) {
      throw new ServiceUnavailableException(
        'Could not resend sign-in code email. Try again shortly.',
      );
    }

    return {
      loginSessionId: refreshed.id,
      message: 'A new sign-in code was sent to your email',
      expiresIn: OTP_TTL_MS / 1000,
    };
  }

  async walletLogin(dto: WalletLoginDto, ip?: string) {
    const address = dto.walletAddress.toLowerCase() as `0x${string}`;

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new BadRequestException('Invalid wallet address');
    }

    const valid = await verifyMessage({
      address,
      message: dto.message,
      signature: dto.signature as `0x${string}`,
    }).catch(() => false);

    if (!valid) {
      throw new UnauthorizedException('Invalid wallet signature');
    }

    if (!dto.message.toLowerCase().includes(address.slice(2).toLowerCase())) {
      throw new BadRequestException('Signed message must include wallet address');
    }

    let user = await this.prisma.user.findUnique({
      where: { walletAddress: address },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          walletAddress: address,
          displayName: `${address.slice(0, 6)}...${address.slice(-4)}`,
          emailVerified: true,
          status: 'PENDING_PAYMENT',
          lastLoginIp: ip,
        },
      });
    } else {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginIp: ip },
      });
    }

    return this.generateToken(user);
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: { emailVerifyToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifyToken: null,
        status: 'PENDING_PAYMENT',
      },
    });

    return { message: 'Email verified successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (!user?.email || !user.passwordHash) {
      return { message: PASSWORD_RESET_GENERIC_MESSAGE };
    }

    await this.prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    const emailSent = await this.notifications.passwordReset(user.email, token);
    if (!emailSent) {
      await this.prisma.passwordReset.updateMany({
        where: { userId: user.id, tokenHash, usedAt: null },
        data: { usedAt: new Date() },
      });
      throw new ServiceUnavailableException(
        'Could not send password reset email. Try again shortly.',
      );
    }

    return { message: PASSWORD_RESET_GENERIC_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const token = dto.token.trim();
    if (!token) {
      throw new BadRequestException('Reset token is required');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const reset = await this.prisma.passwordReset.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!reset || reset.usedAt) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    if (reset.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Reset link expired — request a new password reset',
      );
    }

    if (!reset.user.passwordHash) {
      throw new BadRequestException('This account cannot reset a password');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordReset.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.loginOtp.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    return {
      message: 'Password updated. You can sign in with your new password.',
    };
  }

  async activateAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { virtualAccount: true },
    });

    if (!user) throw new BadRequestException('User not found');
    if (!user.registrationPaid) {
      throw new BadRequestException('Registration fee not paid');
    }

    if (!user.virtualAccount) {
      await this.prisma.virtualAccount.create({
        data: {
          userId,
          balance: STARTING_BALANCE,
          maxRiskPerTrade: MAX_RISK_PER_TRADE,
          riskPercent: RISK_PERCENT,
        },
      });
    }

    const activeSubscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    if (!activeSubscription) {
      await this.prisma.subscription.create({
        data: {
          userId,
          plan: 'FREE',
          isActive: true,
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE' },
    });

    return { message: 'Account activated with $1000 virtual funded account' };
  }

  private generateToken(user: {
    id: string;
    email: string | null;
    role: string;
    displayName: string;
  }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: this.sanitizeUser(user),
    };
  }

  private sanitizeUser(user: Record<string, unknown>) {
    const { passwordHash, emailVerifyToken, ...safe } = user;
    void passwordHash;
    void emailVerifyToken;
    return safe;
  }
}
