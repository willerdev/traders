import { Module } from '@nestjs/common';
import { BlockchainController } from './blockchain.controller';
import { BlockchainService } from './blockchain.service';
import { ChainSyncService } from './chain-sync.service';

@Module({
  controllers: [BlockchainController],
  providers: [BlockchainService, ChainSyncService],
  exports: [BlockchainService, ChainSyncService],
})
export class BlockchainModule {}
