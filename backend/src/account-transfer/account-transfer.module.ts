import { Module } from '@nestjs/common';
import { AccountTransferService } from './account-transfer.service';
import { AccountTransferAdminController } from './account-transfer-admin.controller';
import { AccountTransferPublicController } from './account-transfer-public.controller';
import { AuthModule } from '../auth/auth.module';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';

@Module({
  imports: [AuthModule],
  controllers: [
    AccountTransferAdminController,
    AccountTransferPublicController,
  ],
  providers: [AccountTransferService, AdminPermissionGuard],
  exports: [AccountTransferService],
})
export class AccountTransferModule {}
