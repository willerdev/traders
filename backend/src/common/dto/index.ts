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
  Equals,
  IsIn,
  ValidateIf,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TradeDirection, KycDocumentType } from '@prisma/client';
import { AllowedDisplayName } from '../validators/allowed-display-name.validator';

export class RegisterDto {
  @IsEmail()
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
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
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

  @IsString()
  @IsNotEmpty()
  walletAddress: string;
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

/** Trade lifecycle sync — opened / in-trade / closed (TP or SL). */
export class TradeLifecycleItemDto {
  @IsIn(['opened', 'open', 'closed'])
  event: 'opened' | 'open' | 'closed';

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
}

export class TradeLifecycleWebhookDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradeLifecycleItemDto)
  trades?: TradeLifecycleItemDto[];

  @IsOptional()
  @IsIn(['opened', 'open', 'closed'])
  event?: 'opened' | 'open' | 'closed';

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

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;
}
