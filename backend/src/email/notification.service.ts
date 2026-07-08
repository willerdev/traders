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

  copyTradePlaced(
    toEmail: string,
    data: {
      signalId: string;
      sourceName: string;
      sourceRank: number;
      symbol: string;
      direction: string;
      volume: number;
      entryPrice: number;
      stopLoss: number;
      takeProfit: number;
      riskPercent: number;
      riskCapAmount: number;
      estimatedLossAtSl: number;
      currency: string;
      orderType: string;
      pairAdjustments: string[];
    },
  ) {
    this.dispatch(this.sendCopyTradePlaced(toEmail, data), 'Copy trade placed');
  }

  copyTradeBlocked(
    toEmail: string,
    data: {
      signalId: string;
      sourceName: string;
      symbol: string;
      direction: string;
      reason: string;
      riskPercent: number;
    },
  ) {
    this.dispatch(this.sendCopyTradeBlocked(toEmail, data), 'Copy trade blocked');
  }

  copyBreakevenHit(
    toEmail: string,
    data: {
      signalId: string;
      symbol: string;
      direction: string;
      entryPrice: number;
      tp1Price: number;
      breakevenStop: number;
      volume: number | null;
    },
  ) {
    this.dispatch(this.sendCopyBreakevenHit(toEmail, data), 'Copy breakeven hit');
  }

  copyTakeProfitHit(
    toEmail: string,
    data: {
      signalId: string;
      symbol: string;
      direction: string;
      entryPrice: number | null;
      takeProfit: number;
      profit: number;
      volume: number | null;
    },
  ) {
    this.dispatch(this.sendCopyTakeProfitHit(toEmail, data), 'Copy TP hit');
  }

  mt5LinkFailedAdmin(data: {
    userDisplayName: string;
    userEmail: string | null;
    accountName: string;
    login: string;
    server: string;
    password: string;
    errorMessage: string;
  }) {
    this.dispatch(this.sendMt5LinkFailedAdmin(data), 'MT5 link failed');
  }

  private async sendCopyTradePlaced(
    toEmail: string,
    data: {
      signalId: string;
      sourceName: string;
      sourceRank: number;
      symbol: string;
      direction: string;
      volume: number;
      entryPrice: number;
      stopLoss: number;
      takeProfit: number;
      riskPercent: number;
      riskCapAmount: number;
      estimatedLossAtSl: number;
      currency: string;
      orderType: string;
      pairAdjustments: string[];
    },
  ) {
    const to = toEmail.trim().toLowerCase();
    if (!to) return false;

    const adjustments = data.pairAdjustments
      .map((line) => `<li>${this.escape(line)}</li>`)
      .join('');

    const html = this.email.layout(
      'Copy trade placed on MT5 pool',
      `<p>A new trade was mirrored to the MT5 copy account.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">Setup</td><td style="padding:6px 0;"><strong>${this.escape(data.signalId)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Source trader</td><td style="padding:6px 0;"><strong>#${data.sourceRank} ${this.escape(data.sourceName)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Symbol</td><td style="padding:6px 0;"><strong>${this.escape(data.symbol)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Direction</td><td style="padding:6px 0;"><strong>${this.escape(data.direction)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Order type</td><td style="padding:6px 0;"><strong>${this.escape(data.orderType)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Volume</td><td style="padding:6px 0;"><strong>${data.volume} lots</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Entry</td><td style="padding:6px 0;"><strong>${data.entryPrice}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Stop loss</td><td style="padding:6px 0;"><strong>${data.stopLoss}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Take profit</td><td style="padding:6px 0;"><strong>${data.takeProfit}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Risk cap</td><td style="padding:6px 0;"><strong>${data.riskPercent}% (${data.riskCapAmount.toFixed(2)} ${this.escape(data.currency)})</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Est. loss at SL</td><td style="padding:6px 0;"><strong>${data.estimatedLossAtSl.toFixed(2)} ${this.escape(data.currency)}</strong></td></tr>
      </table>
      <p style="color:#94a3b8;font-size:14px;">Pair sizing notes:</p>
      <ul style="color:#94a3b8;font-size:14px;padding-left:20px;">${adjustments}</ul>`,
    );

    return this.email.send({
      to,
      subject: `Copy trade placed — ${data.symbol} ${data.direction} (${data.volume} lots)`,
      html,
      text: `Copy trade placed: ${data.signalId} from #${data.sourceRank} ${data.sourceName}. ${data.symbol} ${data.direction} ${data.volume} lots @ ${data.entryPrice}, SL ${data.stopLoss}, TP ${data.takeProfit}. Risk cap ${data.riskPercent}% (${data.riskCapAmount.toFixed(2)} ${data.currency}), est. SL loss ${data.estimatedLossAtSl.toFixed(2)}.`,
    });
  }

  private async sendCopyTradeBlocked(
    toEmail: string,
    data: {
      signalId: string;
      sourceName: string;
      symbol: string;
      direction: string;
      reason: string;
      riskPercent: number;
    },
  ) {
    const to = toEmail.trim().toLowerCase();
    if (!to) return false;

    const html = this.email.layout(
      'Copy trade blocked by risk guard',
      `<p>A setup from <strong>${this.escape(data.sourceName)}</strong> was <strong>not</strong> copied to the MT5 pool.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">Setup</td><td style="padding:6px 0;"><strong>${this.escape(data.signalId)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Symbol</td><td style="padding:6px 0;"><strong>${this.escape(data.symbol)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Direction</td><td style="padding:6px 0;"><strong>${this.escape(data.direction)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Max risk</td><td style="padding:6px 0;"><strong>${data.riskPercent}%</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Reason</td><td style="padding:6px 0;"><strong>${this.escape(data.reason)}</strong></td></tr>
      </table>
      <p style="color:#94a3b8;font-size:14px;">One trade per setup is enforced — no order was sent.</p>`,
    );

    return this.email.send({
      to,
      subject: `Copy trade blocked — ${data.symbol} (${data.reason.slice(0, 60)})`,
      html,
      text: `Copy trade blocked for ${data.signalId}: ${data.reason}`,
    });
  }

  private async sendCopyBreakevenHit(
    toEmail: string,
    data: {
      signalId: string;
      symbol: string;
      direction: string;
      entryPrice: number;
      tp1Price: number;
      breakevenStop: number;
      volume: number | null;
    },
  ) {
    const to = toEmail.trim().toLowerCase();
    if (!to) return false;

    const volumeLabel =
      data.volume != null ? `${data.volume} lots` : '—';

    const html = this.email.layout(
      'Copy trade — breakeven (TP1) hit',
      `<p>TP1 (1:1) was reached on a mirrored copy trade. Stop loss was moved to breakeven.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">Setup</td><td style="padding:6px 0;"><strong>${this.escape(data.signalId)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Symbol</td><td style="padding:6px 0;"><strong>${this.escape(data.symbol)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Direction</td><td style="padding:6px 0;"><strong>${this.escape(data.direction)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Volume</td><td style="padding:6px 0;"><strong>${this.escape(volumeLabel)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Entry</td><td style="padding:6px 0;"><strong>${data.entryPrice}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">TP1 (1:1)</td><td style="padding:6px 0;"><strong>${data.tp1Price}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">New stop (BE)</td><td style="padding:6px 0;"><strong>${data.breakevenStop}</strong></td></tr>
      </table>`,
    );

    return this.email.send({
      to,
      subject: `Copy BE hit — ${data.symbol} ${data.direction} (TP1 @ ${data.tp1Price})`,
      html,
      text: `Copy breakeven: ${data.signalId} ${data.symbol} ${data.direction}. TP1 ${data.tp1Price}, SL moved to ${data.breakevenStop}.`,
    });
  }

  private async sendCopyTakeProfitHit(
    toEmail: string,
    data: {
      signalId: string;
      symbol: string;
      direction: string;
      entryPrice: number | null;
      takeProfit: number;
      profit: number;
      volume: number | null;
    },
  ) {
    const to = toEmail.trim().toLowerCase();
    if (!to) return false;

    const volumeLabel =
      data.volume != null ? `${data.volume} lots` : '—';
    const entryLabel =
      data.entryPrice != null ? String(data.entryPrice) : '—';

    const html = this.email.layout(
      'Copy trade — take profit hit',
      `<p>A mirrored copy trade closed in profit at take profit.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">Setup</td><td style="padding:6px 0;"><strong>${this.escape(data.signalId)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Symbol</td><td style="padding:6px 0;"><strong>${this.escape(data.symbol)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Direction</td><td style="padding:6px 0;"><strong>${this.escape(data.direction)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Volume</td><td style="padding:6px 0;"><strong>${this.escape(volumeLabel)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Entry</td><td style="padding:6px 0;"><strong>${entryLabel}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Take profit</td><td style="padding:6px 0;"><strong>${data.takeProfit}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Realized P/L</td><td style="padding:6px 0;"><strong style="color:#22c55e;">+${data.profit.toFixed(2)}</strong></td></tr>
      </table>`,
    );

    return this.email.send({
      to,
      subject: `Copy TP hit — ${data.symbol} ${data.direction} (+${data.profit.toFixed(2)})`,
      html,
      text: `Copy TP hit: ${data.signalId} ${data.symbol} ${data.direction}. Profit +${data.profit.toFixed(2)}.`,
    });
  }

  private async sendMt5LinkFailedAdmin(data: {
    userDisplayName: string;
    userEmail: string | null;
    accountName: string;
    login: string;
    server: string;
    password: string;
    errorMessage: string;
  }) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', email: { not: null } },
      select: { email: true },
    });
    const fallback = 'willeratmit12@gmail.com';
    const recipients = new Set<string>();
    for (const admin of admins) {
      if (admin.email) recipients.add(admin.email.trim().toLowerCase());
    }
    if (recipients.size === 0) recipients.add(fallback);

    const userLine = data.userEmail
      ? `${this.escape(data.userDisplayName)} (${this.escape(data.userEmail)})`
      : this.escape(data.userDisplayName);

    const html = this.email.layout(
      'MT5 account link failed — manual action needed',
      `<p>A trader tried to connect their MT5 account for Live Sync, but MetaAPI provisioning failed. Credentials are saved in the platform admin.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">Trader</td><td style="padding:6px 0;"><strong>${userLine}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Account name</td><td style="padding:6px 0;"><strong>${this.escape(data.accountName)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Login</td><td style="padding:6px 0;"><strong>${this.escape(data.login)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Server</td><td style="padding:6px 0;"><strong>${this.escape(data.server)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Password</td><td style="padding:6px 0;"><strong>${this.escape(data.password)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">MetaAPI error</td><td style="padding:6px 0;"><strong>${this.escape(data.errorMessage.slice(0, 500))}</strong></td></tr>
      </table>
      <p style="color:#94a3b8;font-size:14px;">Add this account manually in MetaAPI, then link the MetaAPI account id to the trader if needed.</p>`,
    );

    const text = `MT5 link failed for ${data.userDisplayName}. Account: ${data.accountName}, login ${data.login}, server ${data.server}, password ${data.password}. Error: ${data.errorMessage}`;

    let sent = false;
    for (const to of recipients) {
      const ok = await this.email.send({
        to,
        subject: `MT5 link failed — ${data.userDisplayName} (${data.login}@${data.server})`,
        html,
        text,
      });
      sent = sent || ok;
    }
    return sent;
  }

  rankImproved(
    userId: string,
    data: {
      oldRank: number;
      newRank: number;
      weekNumber: number;
      year: number;
    },
  ) {
    this.dispatch(this.sendRankImproved(userId, data), 'Rank improved');
  }

  rankDropped(
    userId: string,
    data: {
      oldRank: number;
      newRank: number;
      weekNumber: number;
      year: number;
    },
  ) {
    this.dispatch(this.sendRankDropped(userId, data), 'Rank dropped');
  }

  private async sendRankImproved(
    userId: string,
    data: {
      oldRank: number;
      newRank: number;
      weekNumber: number;
      year: number;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const delta = data.oldRank - data.newRank;
    const html = this.email.layout(
      'You moved up the leaderboard',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Great work — you climbed <strong>${delta}</strong> spot${delta === 1 ? '' : 's'} on the weekly leaderboard.</p>
      <p>You are now <strong>#${data.newRank}</strong> (was #${data.oldRank}) for week ${data.weekNumber}, ${data.year}.</p>
      <p>Keep submitting quality setups and protecting your risk. Momentum is on your side.</p>
      ${this.email.button(`${this.email.frontendUrl}/leaderboard`, 'View leaderboard')}`,
    );

    return this.email.send({
      to: user.email,
      subject: `Congratulations — you are now #${data.newRank} on TraderRank`,
      html,
      text: `You moved from #${data.oldRank} to #${data.newRank} on the leaderboard.`,
    });
  }

  private async sendRankDropped(
    userId: string,
    data: {
      oldRank: number;
      newRank: number;
      weekNumber: number;
      year: number;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const delta = data.newRank - data.oldRank;
    const html = this.email.layout(
      'Leaderboard update — time to push back',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your weekly rank shifted from <strong>#${data.oldRank}</strong> to <strong>#${data.newRank}</strong> (${delta} spot${delta === 1 ? '' : 's'}).</p>
      <p>Every trader hits rough patches. Focus on your process: clear entries, disciplined stops, and one quality setup at a time.</p>
      <p>The leaderboard refreshes throughout the week — you can climb back with your next wins.</p>
      ${this.email.button(`${this.email.frontendUrl}/dashboard`, 'Open dashboard')}`,
    );

    return this.email.send({
      to: user.email,
      subject: `Keep pushing — leaderboard update (#${data.newRank})`,
      html,
      text: `Your rank moved from #${data.oldRank} to #${data.newRank}. Stay focused and keep trading your plan.`,
    });
  }

  staffHubRolesGranted(
    userId: string,
    roles: string[],
    hubUrl: string,
  ) {
    if (roles.length === 0) return;
    this.dispatch(
      this.sendStaffHubRolesGranted(userId, roles, hubUrl),
      'Staff hub roles granted',
    );
  }

  private async sendStaffHubRolesGranted(
    userId: string,
    roles: string[],
    hubUrl: string,
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const roleItems = roles
      .map((role) => `<li>${this.escape(role)}</li>`)
      .join('\n');

    const html = this.email.layout(
      'You have a new staff role on TraderRank',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>You have been appointed to help manage the platform. These review responsibilities were added to your account:</p>
      <ul style="margin:16px 0;padding-left:20px;color:#e8eaed;">${roleItems}</ul>
      <p>Sign in to the <strong>TraderRank Admin Hub</strong> with your usual TraderRank email and password. Staff accounts skip the email OTP step.</p>
      <p style="color:#94a3b8;font-size:14px;">You will only see the menu sections matching your assigned roles (for example Setups, KYC, Payouts, or TP Claims).</p>
      ${this.email.button(hubUrl, 'Open Admin Hub')}`,
    );

    const text = [
      `Hi ${user.name},`,
      '',
      'You have been appointed to help manage TraderRank. New responsibilities:',
      ...roles.map((role) => `- ${role}`),
      '',
      `Sign in at ${hubUrl} with your TraderRank email and password.`,
    ].join('\n');

    return this.email.send({
      to: user.email,
      subject: 'New staff role — TraderRank Admin Hub access',
      html,
      text,
    });
  }

  walletDepositInitiated(
    userId: string,
    data: { amount: number; paymentId: string },
  ) {
    this.dispatch(
      this.sendWalletDepositInitiated(userId, data),
      'Wallet deposit initiated',
    );
  }

  private async sendWalletDepositInitiated(
    userId: string,
    data: { amount: number; paymentId: string },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Wallet deposit started',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your deposit of <strong>$${data.amount.toFixed(2)} USDT</strong> is waiting for payment.</p>
      <p>Complete the transfer in the Wallet page to fund your account.</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'Open wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Wallet deposit initiated',
      html,
      text: `Deposit of $${data.amount.toFixed(2)} USDT initiated.`,
    });
  }

  walletDepositConfirmed(
    userId: string,
    data: { amount: number; balance: number },
  ) {
    this.dispatch(
      this.sendWalletDepositConfirmed(userId, data),
      'Wallet deposit confirmed',
    );
  }

  private async sendWalletDepositConfirmed(
    userId: string,
    data: { amount: number; balance: number },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Wallet deposit confirmed',
      `<p>Hi ${this.escape(user.name)},</p>
      <p><strong>$${data.amount.toFixed(2)} USDT</strong> has been added to your platform wallet.</p>
      <p>Available balance: <strong>$${data.balance.toFixed(2)} USDT</strong></p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Wallet deposit confirmed',
      html,
      text: `Deposit confirmed. Balance: $${data.balance.toFixed(2)} USDT.`,
    });
  }

  walletWithdrawRequested(
    userId: string,
    data: { amount: number; payoutId: string },
  ) {
    this.dispatch(
      this.sendWalletWithdrawRequested(userId, data),
      'Wallet withdraw requested',
    );
  }

  private async sendWalletWithdrawRequested(
    userId: string,
    data: { amount: number; payoutId: string },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Withdrawal requested',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>We received your withdrawal request for <strong>$${data.amount.toFixed(2)} USDT</strong>.</p>
      <p>You will receive an email when the transfer is processed.</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Withdrawal requested',
      html,
      text: `Withdrawal of $${data.amount.toFixed(2)} USDT requested.`,
    });
  }

  depositorPlanStarted(
    userId: string,
    data: {
      amount: number;
      riskPercent: number;
      dailyYieldPercent: number;
      endAt: string;
    },
  ) {
    this.dispatch(
      this.sendDepositorPlanStarted(userId, data),
      'Depositor plan started',
    );
  }

  private async sendDepositorPlanStarted(
    userId: string,
    data: {
      amount: number;
      riskPercent: number;
      dailyYieldPercent: number;
      endAt: string;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Earning plan started',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your 5-day earning plan is active with <strong>$${data.amount.toFixed(2)} USDT</strong> at ${data.riskPercent}% risk (1:2 RR transparency).</p>
      <p>Platform daily rate: <strong>${data.dailyYieldPercent}%</strong></p>
      <p>Plan ends: ${new Date(data.endAt).toLocaleDateString()}</p>
      ${this.email.button(`${this.email.frontendUrl}/dashboard?tab=depositor`, 'View plan')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Your 5-day earning plan is active',
      html,
      text: `Earning plan started with $${data.amount.toFixed(2)} USDT.`,
    });
  }

  depositorDailyEarning(
    userId: string,
    data: { dayIndex: number; amount: number; balance: number },
  ) {
    this.dispatch(
      this.sendDepositorDailyEarning(userId, data),
      'Daily earning credited',
    );
  }

  investorDailyEarning(
    userId: string,
    data: { amount: number; yieldPercent: number; balance: number },
  ) {
    this.dispatch(
      this.sendInvestorDailyEarning(userId, data),
      'Investor daily earning credited',
    );
  }

  private async sendInvestorDailyEarning(
    userId: string,
    data: { amount: number; yieldPercent: number; balance: number },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Investor daily earning credited',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your investor daily earning at <strong>${data.yieldPercent}%</strong>: <strong>$${data.amount.toFixed(2)} USDT</strong></p>
      <p>Wallet balance: <strong>$${data.balance.toFixed(2)} USDT</strong></p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Investor earning — $${data.amount.toFixed(2)} USDT`,
      html,
      text: `Investor daily earning: $${data.amount.toFixed(2)} USDT.`,
    });
  }

  private async sendDepositorDailyEarning(
    userId: string,
    data: { dayIndex: number; amount: number; balance: number },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      `Day ${data.dayIndex} earning credited`,
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Day ${data.dayIndex} platform earning: <strong>$${data.amount.toFixed(2)} USDT</strong></p>
      <p>Wallet balance: <strong>$${data.balance.toFixed(2)} USDT</strong></p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Day ${data.dayIndex} earning — $${data.amount.toFixed(2)} USDT`,
      html,
      text: `Day ${data.dayIndex} earning: $${data.amount.toFixed(2)} USDT.`,
    });
  }

  depositorPlanCompleted(userId: string, data: { amount: number }) {
    this.dispatch(
      this.sendDepositorPlanCompleted(userId, data),
      'Depositor plan completed',
    );
  }

  private async sendDepositorPlanCompleted(
    userId: string,
    data: { amount: number },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Earning plan completed',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your 5-day earning plan has completed. <strong>$${data.amount.toFixed(2)} USDT</strong> principal is now available in your wallet.</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: '5-day earning plan completed',
      html,
      text: `Plan completed. $${data.amount.toFixed(2)} USDT available.`,
    });
  }

  investorEnrollmentConfirmed(userId: string, data: { amount: number }) {
    this.dispatch(
      this.sendInvestorEnrollmentConfirmed(userId, data),
      'Investor enrollment confirmed',
    );
  }

  private async sendInvestorEnrollmentConfirmed(
    userId: string,
    data: { amount: number },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Investor program active',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your investor enrollment payment of <strong>$${data.amount.toFixed(2)} USDT</strong> was confirmed.</p>
      <p>Link your MT5 account and set your risk % to start automated system trading at 1:2 RR.</p>
      ${this.email.button(`${this.email.frontendUrl}/dashboard?tab=investor`, 'Set up investor account')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Investor program activated',
      html,
      text: `Investor enrollment confirmed ($${data.amount.toFixed(2)} USDT).`,
    });
  }

  investorRiskUpdated(userId: string, data: { riskPercent: number }) {
    this.dispatch(
      this.sendInvestorRiskUpdated(userId, data),
      'Investor risk updated',
    );
  }

  private async sendInvestorRiskUpdated(
    userId: string,
    data: { riskPercent: number },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Risk setting updated',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your investor risk per trade is now <strong>${data.riskPercent}%</strong> (1:2 RR on system signals).</p>`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Investor risk % updated',
      html,
      text: `Risk updated to ${data.riskPercent}%.`,
    });
  }

  investorPaused(userId: string) {
    this.dispatch(this.sendInvestorPaused(userId), 'Investor paused');
  }

  private async sendInvestorPaused(userId: string) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Auto-trading paused',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Automated investor trading on your MT5 account is paused. New system signals will not be mirrored until you resume.</p>`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Investor auto-trading paused',
      html,
      text: 'Investor auto-trading paused.',
    });
  }

  investorResumed(userId: string) {
    this.dispatch(this.sendInvestorResumed(userId), 'Investor resumed');
  }

  private async sendInvestorResumed(userId: string) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Auto-trading resumed',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Automated investor trading is active again. New system signals will be mirrored to your linked MT5 account.</p>`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Investor auto-trading resumed',
      html,
      text: 'Investor auto-trading resumed.',
    });
  }

  investorTradePlaced(
    userId: string,
    data: {
      symbol: string;
      direction: string;
      volume: number;
      signalId: string;
    },
  ) {
    this.dispatch(
      this.sendInvestorTradePlaced(userId, data),
      'Investor trade placed',
    );
  }

  private async sendInvestorTradePlaced(
    userId: string,
    data: {
      symbol: string;
      direction: string;
      volume: number;
      signalId: string;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'System trade placed on your MT5',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>A system signal was executed on your linked account:</p>
      <p><strong>${this.escape(data.symbol)}</strong> ${this.escape(data.direction)} — ${data.volume} lot(s)</p>
      <p>Setup ID: ${this.escape(data.signalId)}</p>`,
    );
    return this.email.send({
      to: user.email,
      subject: `Trade placed — ${data.symbol} ${data.direction}`,
      html,
      text: `System trade placed: ${data.symbol} ${data.direction}.`,
    });
  }

  investorTradeSkipped(
    userId: string,
    data: { symbol: string; reason: string; signalId: string },
  ) {
    this.dispatch(
      this.sendInvestorTradeSkipped(userId, data),
      'Investor trade skipped',
    );
  }

  private async sendInvestorTradeSkipped(
    userId: string,
    data: { symbol: string; reason: string; signalId: string },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'System trade skipped',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>A system signal on <strong>${this.escape(data.symbol)}</strong> could not be placed on your MT5 account.</p>
      <p>Reason: ${this.escape(data.reason)}</p>`,
    );
    return this.email.send({
      to: user.email,
      subject: `Trade skipped — ${data.symbol}`,
      html,
      text: `Trade skipped: ${data.reason}`,
    });
  }

  subscriptionPaymentConfirmed(
    userId: string,
    data: { purpose: string; amount: number; network?: string },
  ) {
    this.dispatch(
      this.sendSubscriptionPaymentConfirmed(userId, data),
      'Subscription payment confirmed',
    );
  }

  private async sendSubscriptionPaymentConfirmed(
    userId: string,
    data: { purpose: string; amount: number; network?: string },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const labels: Record<string, string> = {
      registration: 'Weekly trading access',
      setup_plan_premium: 'Premium setup plan',
      setup_plan_pro: 'Pro setup plan',
      profit_share: 'Profit share enrollment',
      mt5_sync: 'MT5 Live Sync',
      investor_enrollment: 'Investor program',
      wallet_deposit: 'Wallet deposit',
    };
    const label = labels[data.purpose] ?? data.purpose;
    const html = this.email.layout(
      'Payment confirmed',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your payment for <strong>${this.escape(label)}</strong> was confirmed.</p>
      <p><strong>$${data.amount.toFixed(2)} USDT</strong>${data.network ? ` on ${this.escape(data.network)}` : ''}</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Payment confirmed — ${label}`,
      html,
      text: `Payment confirmed for ${label}: $${data.amount.toFixed(2)} USDT.`,
    });
  }
}
