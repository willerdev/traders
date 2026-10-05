import { Module } from '@nestjs/common';
import { BinanceWeb3WalletService } from './binance-web3-wallet.service';

@Module({
  providers: [BinanceWeb3WalletService],
  exports: [BinanceWeb3WalletService],
})
export class BinanceWeb3Module {}
