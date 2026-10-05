import { Module, forwardRef } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { SavedWithdrawalWalletService } from './saved-withdrawal-wallet.service';
import { PaymentsModule } from '../payments/payments.module';
import { EmailModule } from '../email/email.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { SoloMt5Module } from '../solo-mt5/solo-mt5.module';
import { SoloTradingAdminGuard } from '../auth/guards/solo-trading-admin.guard';
import { BinanceWeb3Module } from '../binance-web3/binance-web3.module';

@Module({
  imports: [
    forwardRef(() => PaymentsModule),
    EmailModule,
    ComplianceModule,
    forwardRef(() => FlutterwaveModule),
    forwardRef(() => PayoutsModule),
    forwardRef(() => SoloMt5Module),
    BinanceWeb3Module,
  ],
  controllers: [WalletController],
  providers: [WalletService, SavedWithdrawalWalletService, SoloTradingAdminGuard],
  exports: [WalletService, SavedWithdrawalWalletService],
})
export class WalletModule {}
