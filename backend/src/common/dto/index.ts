import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  MinLength,
  Equals,
} from 'class-validator';
import { TradeDirection, KycDocumentType } from '@prisma/client';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
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
