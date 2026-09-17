import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { InvestorModule } from '../investor/investor.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { SoloPlatformJobsService } from './solo-platform-jobs.service';

@Module({
  imports: [WalletModule, InvestorModule, BlockchainModule, PayoutsModule],
  providers: [SoloPlatformJobsService],
})
export class SoloPlatformModule {}
