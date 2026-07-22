import { Module } from '@nestjs/common';
import { PlatformJobsService } from './platform-jobs.service';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CopyTradingModule } from '../copy-trading/copy-trading.module';
import { Mt5SyncModule } from '../mt5-sync/mt5-sync.module';
import { WalletModule } from '../wallet/wallet.module';
import { InvestorModule } from '../investor/investor.module';
import { AbuseHunterService } from './abuse-hunter.service';
import { AccountTransferModule } from '../account-transfer/account-transfer.module';

@Module({
  imports: [
    LeaderboardModule,
    PayoutsModule,
    PrismaModule,
    CopyTradingModule,
    Mt5SyncModule,
    WalletModule,
    InvestorModule,
    AccountTransferModule,
  ],
  providers: [PlatformJobsService, AbuseHunterService],
})
export class PlatformModule {}
