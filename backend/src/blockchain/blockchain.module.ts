import { Module } from '@nestjs/common';
import { BlockchainController } from './blockchain.controller';
import { BlockchainService } from './blockchain.service';
import { ChainSyncService } from './chain-sync.service';
import { ChainEnrollmentService } from './chain-enrollment.service';
import { KycAiService } from './kyc-ai.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [BlockchainController],
  providers: [
    BlockchainService,
    ChainSyncService,
    ChainEnrollmentService,
    KycAiService,
  ],
  exports: [
    BlockchainService,
    ChainSyncService,
    ChainEnrollmentService,
    KycAiService,
  ],
})
export class BlockchainModule {}
