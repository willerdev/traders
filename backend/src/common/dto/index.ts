import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  MinLength,
  MaxLength,
  Min,
  Equals,
  IsIn,
  ValidateIf,
  IsArray,
  ValidateNested,
  IsInt,
  Max,
  IsISO8601,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { TradeDirection, KycDocumentType, PayoutMethod } from '@prisma/client';
import { AllowedDisplayName } from '../validators/allowed-display-name.validator';

export class RegisterDto {
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  @AllowedDisplayName()
  displayName: string;

  @IsBoolean()
  @Equals(true, { message: 'You must accept the terms and risk disclosure' })
  acceptTerms: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  referralCode?: string;
}

export class UpdateReferralSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  kycRewardUsdt?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  paidRewardUsdt?: number;
}

export class UpdateCopySettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  copyRiskPercent?: number;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  copyNotifyEmail?: string;
}

export class MarketingTestEmailDto {
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email?: string;
}

export class LoginDto {
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsString()
  password: string;
}

export class VerifyLoginOtpDto {
  @IsString()
  @IsNotEmpty()
  loginSessionId: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;
}

export class ResendLoginOtpDto {
  @IsString()
  @IsNotEmpty()
  loginSessionId: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class UpdatePaymentDetailsDto {
  @IsEnum(PayoutMethod)
  payoutMethod: PayoutMethod;

  @ValidateIf((o: UpdatePaymentDetailsDto) => o.payoutMethod === 'TRC20')
  @IsString()
  @IsNotEmpty()
  trc20Address?: string;

  @ValidateIf((o: UpdatePaymentDetailsDto) => o.payoutMethod === 'MOBILE_MONEY')
  @IsString()
  @IsNotEmpty()
  mobileMoneyProvider?: string;

  @ValidateIf((o: UpdatePaymentDetailsDto) => o.payoutMethod === 'MOBILE_MONEY')
  @IsString()
  @MinLength(8)
  mobileMoneyNumber?: string;

  @ValidateIf((o: UpdatePaymentDetailsDto) => o.payoutMethod === 'MOBILE_MONEY')
  @IsOptional()
  @IsString()
  mobileMoneyAccountName?: string;
}

export class WalletLoginDto {
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}

export class CreateSignalDto {
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsEnum(TradeDirection)
  direction: TradeDirection;

  @IsNumber()
  entryMin: number;

  @IsNumber()
  entryMax: number;

  @IsNumber()
  stopLoss: number;

  @IsNumber()
  takeProfit: number;

  @IsNumber()
  riskRewardRatio: number;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  screenshotUrl: string;
}

export class RequestPayoutDto {
  @IsString()
  @IsNotEmpty()
  payoutId: string;

  @IsOptional()
  @IsString()
  walletAddress?: string;
}

export class RequestTpClaimPayoutDto {
  @IsOptional()
  @IsString()
  walletAddress?: string;
}

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  network: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  promoCode?: string;
}

export class CreateSetupPlanPaymentDto {
  @IsString()
  @IsNotEmpty()
  network: string;

  @IsString()
  @IsIn(['PREMIUM', 'PRO'])
  plan: 'PREMIUM' | 'PRO';
}

export class CreateProfitSharePaymentDto {
  @IsString()
  @IsNotEmpty()
  network: string;
}

export class CreateMt5SyncPaymentDto {
  @IsString()
  @IsNotEmpty()
  network: string;
}

export class ApplyPromoDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class CreatePromoCodeDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsOptional()
  @IsNumber()
  discountPercent?: number;

  @IsOptional()
  @IsString()
  description?: string;

  /** Days until expiry; defaults to 7 if expiresAt not set */
  @IsOptional()
  @IsNumber()
  expiresInDays?: number;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class SaveSignalDraftDto {
  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsEnum(TradeDirection)
  direction?: TradeDirection;

  @IsOptional()
  @IsNumber()
  entryMin?: number;

  @IsOptional()
  @IsNumber()
  entryMax?: number;

  @IsOptional()
  @IsNumber()
  stopLoss?: number;

  @IsOptional()
  @IsNumber()
  takeProfit?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  screenshotUrl?: string;

  @IsOptional()
  aiFilled?: boolean;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @AllowedDisplayName()
  displayName?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;
}

export class UpdateTradingAccountDto {
  @IsOptional()
  @IsString()
  metaApiAccountId?: string | null;
}

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;
}

export class SubmitKycDto {
  @IsEnum(KycDocumentType)
  documentType: KycDocumentType;

  @IsString()
  @IsNotEmpty()
  documentNumber: string;

  @IsString()
  @IsNotEmpty()
  documentFrontUrl: string;

  @IsOptional()
  @IsString()
  documentBackUrl?: string;

  @IsString()
  @IsNotEmpty()
  selfieUrl: string;
}

export class ClaimSetupDto {
  @IsIn(['tp', 'sl'])
  outcome: 'tp' | 'sl';

  @IsOptional()
  @IsIn(['full', 'rr_1_1'])
  tpClaimType?: 'full' | 'rr_1_1';

  @ValidateIf((o: ClaimSetupDto) => o.outcome === 'tp')
  @IsString()
  @IsNotEmpty()
  beforeScreenshotUrl?: string;

  @ValidateIf((o: ClaimSetupDto) => o.outcome === 'tp')
  @IsString()
  @IsNotEmpty()
  afterScreenshotUrl?: string;
}

export class ResubmitTpClaimDto {
  @IsString()
  @IsNotEmpty()
  beforeScreenshotUrl: string;

  @IsString()
  @IsNotEmpty()
  afterScreenshotUrl: string;
}

export class TradeOutcomeWebhookDto {
  @IsOptional()
  @IsString()
  signalId?: string;

  @IsOptional()
  @IsString()
  external_id?: string;

  @IsOptional()
  @IsIn(['tp', 'sl'])
  outcome?: 'tp' | 'sl';

  @IsOptional()
  @IsNumber()
  exit_price?: number;

  /** Signal Hub sends done/failed instead of outcome */
  @IsOptional()
  @IsString()
  status?: string;
}

/** Trade lifecycle sync — opened / in-trade / closed / partial. */
export class TradeLifecycleItemDto {
  @IsIn(['opened', 'open', 'closed', 'partial', 'partial_close'])
  event: 'opened' | 'open' | 'closed' | 'partial' | 'partial_close';

  @IsString()
  @IsNotEmpty()
  sender: string;

  @IsOptional()
  @IsString()
  sendername?: string;

  @IsOptional()
  @IsString()
  signalId?: string;

  @IsOptional()
  @IsString()
  external_id?: string;

  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsIn(['buy', 'sell', 'BUY', 'SELL'])
  direction?: string;

  @IsOptional()
  @IsNumber()
  entry?: number;

  @IsOptional()
  @IsNumber()
  sl?: number;

  @IsOptional()
  @IsNumber()
  tp?: number;

  @IsOptional()
  @IsNumber()
  exit_price?: number;

  @IsOptional()
  @IsIn(['tp', 'sl'])
  outcome?: 'tp' | 'sl';

  @IsOptional()
  @IsNumber()
  ticket?: number;

  @IsOptional()
  @IsString()
  opened_at?: string;

  @IsOptional()
  @IsString()
  closed_at?: string;

  @IsOptional()
  @IsNumber()
  volume?: number;

  @IsOptional()
  @IsNumber()
  profit?: number;

  @IsOptional()
  @IsString()
  message?: string;
}

export class TradeLifecycleWebhookDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradeLifecycleItemDto)
  trades?: TradeLifecycleItemDto[];

  @IsOptional()
  @IsIn(['opened', 'open', 'closed', 'partial', 'partial_close'])
  event?: 'opened' | 'open' | 'closed' | 'partial' | 'partial_close';

  @IsOptional()
  @IsString()
  sender?: string;

  @IsOptional()
  @IsString()
  sendername?: string;

  @IsOptional()
  @IsString()
  signalId?: string;

  @IsOptional()
  @IsString()
  external_id?: string;

  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsIn(['buy', 'sell', 'BUY', 'SELL'])
  direction?: string;

  @IsOptional()
  @IsNumber()
  entry?: number;

  @IsOptional()
  @IsNumber()
  sl?: number;

  @IsOptional()
  @IsNumber()
  tp?: number;

  @IsOptional()
  @IsNumber()
  exit_price?: number;

  @IsOptional()
  @IsIn(['tp', 'sl'])
  outcome?: 'tp' | 'sl';

  @IsOptional()
  @IsNumber()
  ticket?: number;

  @IsOptional()
  @IsString()
  opened_at?: string;

  @IsOptional()
  @IsString()
  closed_at?: string;
}

export class HubActionDto {
  @IsIn([
    'open',
    'add',
    'close',
    'breakeven',
    'modify',
    'partial_close',
    'close_all',
    'ignore',
  ])
  action:
    | 'open'
    | 'add'
    | 'close'
    | 'breakeven'
    | 'modify'
    | 'partial_close'
    | 'close_all'
    | 'ignore';

  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsIn(['buy', 'sell'])
  direction?: 'buy' | 'sell';

  @IsOptional()
  @IsNumber()
  entry?: number;

  @IsOptional()
  @IsNumber()
  sl?: number;

  @IsOptional()
  @IsNumber()
  tp?: number;

  @IsOptional()
  @IsNumber()
  lot?: number;

  @IsOptional()
  @IsNumber()
  ticket?: number;

  @IsOptional()
  @IsString()
  external_id?: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class InvalidateSetupDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateSetupStopsDto {
  @IsOptional()
  @IsNumber()
  stopLoss?: number;

  @IsOptional()
  @IsNumber()
  takeProfit?: number;
}

export class PartialCloseSetupDto {
  @IsNumber()
  @Min(0.01)
  volume: number;
}

export class ListSetupFeedQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['OPEN', 'PENDING', 'ACTIVE', 'WON', 'LOST', 'ARCHIVED', 'CANCELLED', 'ALL'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  symbol?: string;

  @IsOptional()
  @IsISO8601()
  since?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;
}

export class AdminRejectReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
