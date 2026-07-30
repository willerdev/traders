import { Module, forwardRef } from '@nestjs/common';
import { CashAgentsService } from './cash-agents.service';
import { CashAgentsController } from './cash-agents.controller';
import { AgentSessionGuard } from './agent-session.guard';
import { WalletModule } from '../wallet/wallet.module';
import { EmailModule } from '../email/email.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    forwardRef(() => WalletModule),
    EmailModule,
    UploadsModule,
  ],
  controllers: [CashAgentsController],
  providers: [CashAgentsService, AgentSessionGuard],
  exports: [CashAgentsService],
})
export class CashAgentsModule {}
