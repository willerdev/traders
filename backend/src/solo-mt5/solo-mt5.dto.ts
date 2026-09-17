import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveMetaApiTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  token: string;
}

export class LinkMetaApiAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  accountId: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  token?: string;
}
