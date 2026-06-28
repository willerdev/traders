import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto, WalletLoginDto } from '../common/dto';
import { assertAllowedDisplayName } from '../common/display-name.util';
import {
  MAX_RISK_PER_TRADE,
  RISK_PERCENT,
  STARTING_BALANCE,
} from '../common/constants';
import { randomBytes } from 'crypto';
import { verifyMessage } from 'viem';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto, ip?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const emailVerifyToken = randomBytes(32).toString('hex');

    const displayName = assertAllowedDisplayName(dto.displayName);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName,
        emailVerifyToken,
        lastLoginIp: ip,
        termsAcceptedAt: new Date(),
        status: 'PENDING_PAYMENT',
      },
    });

    return {
      user: this.sanitizeUser(user),
      message:
        'Registration successful. Sign in and pay the registration fee to start trading.',
    };
  }

  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginIp: ip },
    });

    return this.generateToken(user);
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
