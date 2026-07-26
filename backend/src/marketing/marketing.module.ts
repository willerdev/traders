import { Module } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { ProductAgentService } from './product-agent.service';
import { MarketingController } from './marketing.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [MarketingController],
  providers: [MarketingService, ProductAgentService],
  exports: [MarketingService, ProductAgentService],
})
export class MarketingModule {}
