import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';
import { CustodyDepositService } from './custody-deposit.service';

@Injectable()
export class PaymentMonitorService {
  private readonly logger = new Logger(PaymentMonitorService.name);
  private running = false;

  constructor(
    private payments: PaymentsService,
    private custodyDeposits: CustodyDepositService,
  ) {}

  /** Poll NOWPayments + on-chain USDT transfers for open payments every minute. */
  @Cron(CronExpression.EVERY_MINUTE)
  async scanPendingPaymentsJob() {
    if (this.running) return;
    this.running = true;

    try {
      const [registration, walletDeposits, custody] = await Promise.all([
        this.payments.syncAllPendingRegistrationPayments(),
        this.payments.syncAllPendingWalletDeposits(),
        this.custodyDeposits.syncAllPendingDeposits(),
      ]);

      if (
        registration.confirmed > 0 ||
        walletDeposits.confirmed > 0 ||
        custody.confirmed > 0
      ) {
        this.logger.log(
          `Payment monitor: ${registration.confirmed} registration (${registration.viaBlockchain} via chain), ${walletDeposits.confirmed} wallet deposit(s), ${custody.confirmed} custody deposit(s) confirmed`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Payment monitor failed: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.running = false;
    }
  }
}
