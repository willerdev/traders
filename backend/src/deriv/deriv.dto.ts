import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class SaveDerivTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  token: string;
}

export class DerivTransferDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  accountFrom: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  accountTo: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  currency: string;
}

const DERIV_CRYPTO_NETWORKS = [
  'TRC20',
  'ERC20',
  'BEP20',
  'BTC',
  'ETH',
  'LTC',
  'USDC',
] as const;

export class SaveDerivCryptoWalletDto {
  @IsString()
  @IsIn(['DEPOSIT', 'WITHDRAW'])
  purpose: 'DEPOSIT' | 'WITHDRAW';

  @IsString()
  @IsIn([...DERIV_CRYPTO_NETWORKS])
  network: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  address: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}
