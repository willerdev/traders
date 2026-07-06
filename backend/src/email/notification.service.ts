import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  private async userContact(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user?.email?.trim()) return null;
    return { email: user.email.trim().toLowerCase(), name: user.displayName };
  }

  private dispatch(task: Promise<boolean>, label: string) {
    void task.catch((err) => {
      this.logger.warn(
        `${label} email failed: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  loginOtp(email: string, code: string) {
    return this.sendLoginOtp(email, code);
  }

  /** Email every admin about a platform-level issue (broker limits, quotas). */
  async adminSystemAlert(subject: string, bodyLines: string[]) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', email: { not: null } },
      select: { email: true },
    });
    if (admins.length === 0) return false;

    const html = this.email.layout(
      subject,
      bodyLines.map((line) => `<p>${line}</p>`).join('\n'),
    );
    const text = bodyLines.join('\n');

    let sent = false;
    for (const admin of admins) {
      const ok = await this.email.send({
        to: admin.email as string,
        subject: `[TraderRank alert] ${subject}`,
        html,
        text,
      });
      sent = sent || ok;
    }
    return sent;
  }

  passwordReset(email: string, token: string) {
    return this.sendPasswordReset(email, token);
  }

  private async sendLoginOtp(email: string, code: string) {
    const to = email.trim().toLowerCase();
    const html = this.email.layout(
      'Your sign-in code',
      `<p>Use this code to finish signing in to TraderRank Pro:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:0.35em;color:#ffffff;margin:16px 0;">${code}</p>
      <p style="color:#94a3b8;font-size:14px;">This code expires in 10 minutes. If you did not try to sign in, you can ignore this email.</p>`,
    );

    return this.email.send({
      to,
      subject: `${code} is your TraderRank Pro sign-in code`,
      html,
      text: `Your sign-in code is ${code}. It expires in 10 minutes.`,
    });
  }

  private async sendPasswordReset(email: string, token: string) {
    const to = email.trim().toLowerCase();
    const resetUrl = `${this.email.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const html = this.email.layout(
      'Reset your password',
      `<p>We received a request to reset your TraderRank Pro password.</p>
      <p>This link expires in 1 hour and can only be used once.</p>
      ${this.email.button(resetUrl, 'Reset password')}
      <p style="color:#94a3b8;font-size:14px;margin-top:24px;">If you did not request this, you can ignore this email. Your password will stay the same.</p>`,
    );

    return this.email.send({
      to,
      subject: 'Reset your TraderRank Pro password',
      html,
      text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
    });
  }

  tpClaimApproved(
    userId: string,
    data: { symbol: string; reward: number; signalId: string },
  ) {
    this.dispatch(this.sendTpClaimApproved(userId, data), 'TP claim approved');
  }

  private async sendTpClaimApproved(
    userId: string,
    data: { symbol: string; reward: number; signalId: string },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const html = this.email.layout(
      'TP claim approved',
      `<p>Hi ${user.name},</p>
      <p>Your take-profit claim for <strong>${data.symbol}</strong> was approved.</p>
      <p><strong>$${data.reward.toFixed(2)}</strong> has been credited to your account.</p>
      <p>Request your USDT payout from the TP Claims page once KYC is verified.</p>
      ${this.email.button(`${this.email.frontendUrl}/tp-claims`, 'Request TP payout')}`,
    );

    return this.email.send({
      to: user.email,
      subject: `TP claim approved — ${data.symbol}`,
      html,
      text: `Your TP claim for ${data.symbol} was approved. $${data.reward.toFixed(2)} credited.`,
    });
  }

  tpClaimRejected(
    userId: string,
    data: { symbol: string; reason: string },
  ) {
    this.dispatch(this.sendTpClaimRejected(userId, data), 'TP claim rejected');
  }

  tp1ClaimAvailable(
    userId: string,
    data: {
      symbol: string;
      signalId: string;
      oneToOnePrice: number;
      breakevenApplied?: boolean;
      breakevenPrice?: number;
    },
  ) {
    this.dispatch(this.sendTp1ClaimAvailable(userId, data), 'TP1 claim available');
  }

  private async sendTp1ClaimAvailable(
    userId: string,
    data: {
      symbol: string;
      signalId: string;
      oneToOnePrice: number;
      breakevenApplied?: boolean;
      breakevenPrice?: number;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const beLine = data.breakevenApplied
      ? `<p>Your stop loss was moved to <strong>breakeven (${data.breakevenPrice})</strong> automatically.</p>`
      : '';

    const html = this.email.layout(
      'TP1 reached — breakeven set',
      `<p>Hi ${user.name},</p>
      <p>Price reached <strong>TP1 (1:1 RR)</strong> on your <strong>${this.escape(data.symbol)}</strong> setup.</p>
      <p>TP1 level: <strong>${data.oneToOnePrice}</strong></p>
      ${beLine}
      <p>You can submit a <strong>1:1 RR claim</strong> with before/after chart screenshots on the TP Claims page. This records your win for scoring — <strong>no KYC or payout request is required</strong> to claim.</p>
      ${this.email.button(`${this.email.frontendUrl}/tp-claims`, 'Claim 1:1 RR')}`,
    );

    return this.email.send({
      to: user.email,
      subject: `TP1 reached on ${data.symbol} — breakeven set, claim your 1:1 RR`,
      html,
      text: `TP1 reached on ${data.symbol} at ${data.oneToOnePrice}.${data.breakevenApplied ? ` Breakeven set at ${data.breakevenPrice}.` : ''} Claim at ${this.email.frontendUrl}/tp-claims`,
    });
  }

  private async sendTpClaimRejected(
    userId: string,
    data: { symbol: string; reason: string },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const html = this.email.layout(
      'TP claim not approved',
      `<p>Hi ${user.name},</p>
      <p>Your take-profit claim for <strong>${data.symbol}</strong> was not approved.</p>
      <p><strong>Reason:</strong> ${this.escape(data.reason)}</p>
      <p>You can resubmit with clearer before/after screenshots if your setup is still open.</p>
      ${this.email.button(`${this.email.frontendUrl}/tp-claims`, 'Reapply TP claim')}`,
    );

    return this.email.send({
      to: user.email,
      subject: `TP claim update — ${data.symbol}`,
      html,
      text: `TP claim for ${data.symbol} rejected: ${data.reason}`,
    });
  }

  payoutApproved(
    userId: string,
    data: {
      amount: number;
      walletAddress: string;
      weekNumber: number;
      year: number;
    },
  ) {
    this.dispatch(this.sendPayoutApproved(userId, data), 'Payout approved');
  }

  private async sendPayoutApproved(
    userId: string,
    data: {
      amount: number;
      walletAddress: string;
      weekNumber: number;
      year: number;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const wallet = `${data.walletAddress.slice(0, 8)}…${data.walletAddress.slice(-6)}`;
    const html = this.email.layout(
      'Payout approved',
      `<p>Hi ${user.name},</p>
      <p>Your payout for week <strong>${data.weekNumber}, ${data.year}</strong> has been approved.</p>
      <p><strong>$${data.amount.toFixed(2)} USDT</strong> is being sent to <code style="color:#93c5fd;">${wallet}</code>.</p>
      ${this.email.button(`${this.email.frontendUrl}/payouts`, 'View payouts')}`,
    );

    return this.email.send({
      to: user.email,
      subject: `Payout approved — $${data.amount.toFixed(2)}`,
      html,
      text: `Payout approved: $${data.amount.toFixed(2)} to ${wallet}`,
    });
  }

  payoutAvailable(
    userId: string,
    data: { amount: number; weekNumber: number; year: number },
  ) {
    this.dispatch(this.sendPayoutAvailable(userId, data), 'Payout available');
  }

  private async sendPayoutAvailable(
    userId: string,
    data: { amount: number; weekNumber: number; year: number },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const html = this.email.layout(
      'Weekly payout ready',
      `<p>Hi ${user.name},</p>
      <p>You have a weekly payout of <strong>$${data.amount.toFixed(2)}</strong> for week <strong>${data.weekNumber}, ${data.year}</strong>.</p>
      <p>Complete KYC (if not already) and submit your USDT wallet on the Payouts page to request it.</p>
      ${this.email.button(`${this.email.frontendUrl}/payouts`, 'Request payout')}`,
    );

    return this.email.send({
      to: user.email,
      subject: `Weekly payout available — $${data.amount.toFixed(2)}`,
      html,
      text: `Weekly payout $${data.amount.toFixed(2)} ready — visit Payouts to request.`,
    });
  }

  kycApproved(userId: string) {
    this.dispatch(this.sendKycApproved(userId), 'KYC approved');
  }

  private async sendKycApproved(userId: string) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const html = this.email.layout(
      'KYC verified',
      `<p>Hi ${user.name},</p>
      <p>Your identity verification (KYC) has been <strong>approved</strong>.</p>
      <p>You can now request payouts when you have eligible weekly earnings.</p>
      ${this.email.button(`${this.email.frontendUrl}/payouts`, 'Go to payouts')}`,
    );

    return this.email.send({
      to: user.email,
      subject: 'KYC approved — you can request payouts',
      html,
      text: 'Your KYC was approved. You can request payouts on thetradeguard.com.',
    });
  }

  kycRejected(userId: string, reason: string) {
    this.dispatch(this.sendKycRejected(userId, reason), 'KYC rejected');
  }

  private async sendKycRejected(userId: string, reason: string) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const html = this.email.layout(
      'KYC needs resubmission',
      `<p>Hi ${user.name},</p>
      <p>Your KYC submission could not be approved.</p>
      <p><strong>Reason:</strong> ${this.escape(reason)}</p>
      <p>Please upload clearer documents in Settings and submit again.</p>
      ${this.email.button(`${this.email.frontendUrl}/settings`, 'Update KYC')}`,
    );

    return this.email.send({
      to: user.email,
      subject: 'KYC update — please resubmit',
      html,
      text: `KYC rejected: ${reason}. Resubmit in Settings.`,
    });
  }

  accountActivated(userId: string) {
    this.dispatch(this.sendAccountActivated(userId), 'Account activated');
  }

  private async sendAccountActivated(userId: string) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const html = this.email.layout(
      'Account activated',
      `<p>Hi ${user.name},</p>
      <p>Your registration is complete and your <strong>$1,000 virtual funded account</strong> is active.</p>
      <p>Submit your first setup from the dashboard to start competing on the leaderboard.</p>
      ${this.email.button(`${this.email.frontendUrl}/dashboard`, 'Open dashboard')}`,
    );

    return this.email.send({
      to: user.email,
      subject: 'Welcome — your TraderRank Pro account is active',
      html,
      text: 'Your account is active with a $1,000 virtual funded account.',
    });
  }

  registrationDenied(userId: string, reason: string) {
    this.dispatch(
      this.sendRegistrationDenied(userId, reason),
      'Registration denied',
    );
  }

  private async sendRegistrationDenied(userId: string, reason: string) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const html = this.email.layout(
      'Registration payment declined',
      `<p>Hi ${user.name},</p>
      <p>Your registration payment could not be approved.</p>
      <p><strong>Reason:</strong> ${this.escape(reason)}</p>
      <p>Contact support via Messages if you believe this is an error.</p>
      ${this.email.button(`${this.email.frontendUrl}/messages`, 'Contact support')}`,
    );

    return this.email.send({
      to: user.email,
      subject: 'Registration payment update',
      html,
      text: `Registration payment declined: ${reason}`,
    });
  }

  paymentConfirmed(
    userId: string,
    data?: { txHash?: string; amount?: number; network?: string },
  ) {
    this.dispatch(this.sendPaymentConfirmed(userId, data), 'Payment confirmed');
  }

  private async sendPaymentConfirmed(
    userId: string,
    data?: { txHash?: string; amount?: number; network?: string },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const txLine = data?.txHash
      ? `<p style="color:#94a3b8;font-size:14px;">Blockchain transaction: <code style="color:#93c5fd;">${this.escape(data.txHash)}</code></p>`
      : '';
    const amountLine =
      data?.amount != null
        ? `<p><strong>$${data.amount.toFixed(2)} USDT</strong>${data.network ? ` on ${this.escape(data.network)}` : ''} received.</p>`
        : '';

    const html = this.email.layout(
      'Payment received',
      `<p>Hi ${user.name},</p>
      ${amountLine}
      <p>We received your registration payment. Your account is now active.</p>
      ${txLine}
      ${this.email.button(`${this.email.frontendUrl}/dashboard`, 'Start trading')}`,
    );

    return this.email.send({
      to: user.email,
      subject: 'Payment confirmed — account activated',
      html,
      text: data?.txHash
        ? `Registration payment confirmed (tx ${data.txHash}). Your account is active.`
        : 'Registration payment confirmed. Your account is active.',
    });
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  tradeOutcome(
    userId: string,
    data: {
      symbol: string;
      signalId: string;
      outcome: 'tp' | 'sl';
      exitPrice: number;
      reward?: number;
      pointsAwarded?: number;
      source?: 'claim' | 'webhook';
    },
  ) {
    this.dispatch(this.sendTradeOutcome(userId, data), 'Trade outcome');
  }

  tradePartialClose(
    userId: string,
    data: {
      symbol: string;
      signalId: string;
      volume?: number;
      profit?: number;
      exitPrice?: number;
      message?: string;
    },
  ) {
    this.dispatch(this.sendTradePartialClose(userId, data), 'Partial close');
  }

  private async sendTradeOutcome(
    userId: string,
    data: {
      symbol: string;
      signalId: string;
      outcome: 'tp' | 'sl';
      exitPrice: number;
      reward?: number;
      pointsAwarded?: number;
      source?: 'claim' | 'webhook';
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const isTp = data.outcome === 'tp';
    const title = isTp ? 'Take profit hit' : 'Stop loss hit';
    const detail = isTp
      ? `<p>Your <strong>${this.escape(data.symbol)}</strong> setup closed at take profit.</p>
         <p>Exit price: <strong>${data.exitPrice}</strong></p>
         ${data.reward != null ? `<p>Reward credited: <strong>$${data.reward.toFixed(2)}</strong></p>` : ''}
         ${data.pointsAwarded != null ? `<p>Score change: <strong>+${data.pointsAwarded} pts</strong></p>` : ''}`
      : `<p>Your <strong>${this.escape(data.symbol)}</strong> setup closed at stop loss.</p>
         <p>Exit price: <strong>${data.exitPrice}</strong></p>
         ${data.pointsAwarded != null ? `<p>Score change: <strong>${data.pointsAwarded} pts</strong></p>` : ''}`;

    const html = this.email.layout(
      title,
      `<p>Hi ${user.name},</p>
      ${detail}
      ${this.email.button(`${this.email.frontendUrl}/dashboard`, 'View dashboard')}`,
    );

    return this.email.send({
      to: user.email,
      subject: `${title} — ${data.symbol}`,
      html,
      text: `${title}: ${data.symbol} @ ${data.exitPrice}`,
    });
  }

  private async sendTradePartialClose(
    userId: string,
    data: {
      symbol: string;
      signalId: string;
      volume?: number;
      profit?: number;
      exitPrice?: number;
      message?: string;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const html = this.email.layout(
      'Partial close on your trade',
      `<p>Hi ${user.name},</p>
      <p>Part of your <strong>${this.escape(data.symbol)}</strong> position was closed.</p>
      ${data.volume != null ? `<p>Volume closed: <strong>${data.volume}</strong></p>` : ''}
      ${data.profit != null ? `<p>Realized P/L: <strong>${data.profit >= 0 ? '+' : ''}${data.profit.toFixed(2)}</strong></p>` : ''}
      ${data.exitPrice != null ? `<p>Close price: <strong>${data.exitPrice}</strong></p>` : ''}
      ${data.message ? `<p style="color:#94a3b8;font-size:14px;">${this.escape(data.message)}</p>` : ''}
      ${this.email.button(`${this.email.frontendUrl}/dashboard`, 'View dashboard')}`,
    );

    return this.email.send({
      to: user.email,
      subject: `Partial close — ${data.symbol}`,
      html,
      text: `Partial close on ${data.symbol}${data.profit != null ? ` P/L ${data.profit}` : ''}`,
    });
  }

  hubOrderPlaced(
    userId: string,
    data: {
      symbol: string;
      signalId: string;
      direction: string;
      orderType: string;
      entry: number;
      entryMin: number;
      entryMax: number;
      stopLoss: number;
      takeProfit: number;
    },
  ) {
    this.dispatch(this.sendHubOrderPlaced(userId, data), 'Hub order placed');
  }

  private async sendHubOrderPlaced(
    userId: string,
    data: {
      symbol: string;
      signalId: string;
      direction: string;
      orderType: string;
      entry: number;
      entryMin: number;
      entryMax: number;
      stopLoss: number;
      takeProfit: number;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const orderLabel =
      data.orderType.toLowerCase() === 'stop' ? 'Stop order' : 'Limit order';

    const html = this.email.layout(
      `${orderLabel} placed`,
      `<p>Hi ${user.name},</p>
      <p>Your <strong>${this.escape(data.symbol)}</strong> setup has a pending ${this.escape(orderLabel.toLowerCase())} on MT5.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">Direction</td><td style="padding:6px 0;"><strong>${this.escape(data.direction)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Order type</td><td style="padding:6px 0;"><strong>${this.escape(data.orderType)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Entry price</td><td style="padding:6px 0;"><strong>${data.entry}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Entry zone</td><td style="padding:6px 0;"><strong>${data.entryMin} – ${data.entryMax}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Stop loss</td><td style="padding:6px 0;"><strong>${data.stopLoss}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Take profit</td><td style="padding:6px 0;"><strong>${data.takeProfit}</strong></td></tr>
      </table>
      ${this.email.button(`${this.email.frontendUrl}/dashboard`, 'View dashboard')}`,
    );

    return this.email.send({
      to: user.email,
      subject: `${orderLabel} placed — ${data.symbol}`,
      html,
      text: `${orderLabel} for ${data.symbol}: ${data.direction} ${data.orderType} @ ${data.entry}, zone ${data.entryMin}-${data.entryMax}, SL ${data.stopLoss}, TP ${data.takeProfit}.`,
    });
  }
}
