import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SaveBinanceWeb3KeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  privateKey: string;
}

export class SendBinanceWeb3Dto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  savedWalletId: string;
}
