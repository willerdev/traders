import { Module } from '@nestjs/common';
import { BlockchainController } from './blockchain.controller';
import { BlockchainService } from './blockchain.service';
import { ChainSyncService } from './chain-sync.service';
import { ChainEnrollmentService } from './chain-enrollment.service';

@Module({
  controllers: [BlockchainController],
  providers: [BlockchainService, ChainSyncService, ChainEnrollmentService],
  exports: [BlockchainService, ChainSyncService, ChainEnrollmentService],
})
export class BlockchainModule {}
