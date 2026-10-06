import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SaveBinanceWeb3KeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  privateKey: string;
}
