import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';

type AirfarmingApplicationEmailData = {
  fullName: string;
  email: string;
  age: number;
  location: string;
  plannedInvestmentUsd: number;
  withdrawPreference: string;
};

function airfarmingWithdrawLabel(pref: string): string {
  const map: Record<string, string> = {
    WEEKLY: 'Weekly',
    MONTHLY: 'Monthly',
    YEARLY: 'Yearly',
  };
  return map[pref] ?? pref;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  /** Always included on ops alerts (register, deposit, withdraw, etc.). */
  private static readonly OPS_ALERT_EMAIL = 'willeratmit12@gmail.com';

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

  /** Admin users + dedicated ops inbox. */
  private async resolveOpsAlertRecipients(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', email: { not: null } },
      select: { email: true },
    });
    const recipients = new Set<string>();
    recipients.add(NotificationService.OPS_ALERT_EMAIL);
    for (const admin of admins) {
      if (admin.email?.trim()) {
        recipients.add(admin.email.trim().toLowerCase());
      }
    }
    return [...recipients];
  }

  /**
   * Send an ops alert to every admin + `OPS_ALERT_EMAIL`, logging each
   * recipient's send result individually. Returns true if at least one send
   * succeeded (or if there were no recipients, which we treat as a warn).
   */
  private async sendOpsAlert(params: {
    label: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<boolean> {
    const recipients = await this.resolveOpsAlertRecipients();
    if (recipients.length === 0) {
      this.logger.warn(
        `${params.label}: no ops recipients resolved — expected at least ${NotificationService.OPS_ALERT_EMAIL}`,
      );
      return false;
    }

    this.logger.log(
      `${params.label}: sending to ${recipients.length} recipient(s) — ${recipients.join(', ')}`,
    );

    let anySent = false;
    for (const to of recipients) {
      try {
        const result = await this.email.sendDetailed({
          to,
          subject: params.subject,
          html: params.html,
          text: params.text,
        });
        if (result.ok) {
          anySent = true;
          this.logger.log(`${params.label}: delivered to ${to}`);
        } else {
          this.logger.warn(
            `${params.label}: FAILED to ${to} — ${result.error ?? 'unknown Resend error'}`,
          );
        }
      } catch (err) {
        this.logger.error(
          `${params.label}: threw for ${to} — ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    if (!anySent) {
      this.logger.error(
        `${params.label}: NO recipients received the email — check RESEND_API_KEY, EMAIL_FROM domain verification, and Resend suppression list for ${recipients.join(', ')}`,
      );
    }
    return anySent;
  }

  private dispatch(task: Promise<boolean>, label: string) {
    void task
      .then((ok) => {
        if (!ok) {
          this.logger.warn(
            `${label} email was not sent — check RESEND_API_KEY, EMAIL_FROM, and Resend domain verification`,
          );
        }
      })
      .catch((err) => {
        this.logger.warn(
          `${label} email failed: ${err instanceof Error ? err.message : err}`,
        );
      });
  }

  loginOtp(email: string, code: string) {
    return this.sendLoginOtp(email, code);
  }

  withdrawalWalletVerify(
    email: string,
    code: string,
    wallet: { label: string; address: string; network: string },
  ) {
    return this.sendWithdrawalWalletVerify(email, code, wallet);
  }

  withdrawalOtp(
    email: string,
    code: string,
    details: {
      amount: number;
      walletLabel: string;
      network: string;
      address: string;
    },
  ) {
    return this.sendWithdrawalOtp(email, code, details);
  }

  walletTransferOtp(
    email: string,
    code: string,
    details: {
      amount: number;
      recipientEmail: string;
      recipientName: string;
    },
  ) {
    return this.sendWalletTransferOtp(email, code, details);
  }

  walletTransferReceived(
    userId: string,
    data: { amount: number; fromName: string; fromEmail: string | null },
  ) {
    this.dispatch(
      this.sendWalletTransferReceived(userId, data),
      'Wallet transfer received',
    );
  }

  peerChatMessage(
    userId: string,
    data: { fromName: string; preview: string; conversationId: string },
  ) {
    this.dispatch(
      this.sendPeerChatMessage(userId, data),
      'Peer chat message',
    );
  }

  /** Email ops + admins about a platform-level issue (broker limits, quotas). */
  async adminSystemAlert(subject: string, bodyLines: string[]) {
    const html = this.email.layout(
      subject,
      bodyLines.map((line) => `<p>${line}</p>`).join('\n'),
    );
    return this.sendOpsAlert({
      label: `Ops alert: ${subject}`,
      subject: `[TraderRank alert] ${subject}`,
      html,
      text: bodyLines.join('\n'),
    });
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

  private async sendWithdrawalWalletVerify(
    email: string,
    code: string,
    wallet: { label: string; address: string; network: string },
  ) {
    const to = email.trim().toLowerCase();
    const masked =
      wallet.address.length > 12
        ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
        : wallet.address;
    const html = this.email.layout(
      'Verify your withdrawal wallet',
      `<p>You requested to save a withdrawal wallet on TraderRank Pro:</p>
      <ul style="color:#cbd5e1;padding-left:1.2rem;">
        <li><strong>Description:</strong> ${wallet.label}</li>
        <li><strong>Network:</strong> ${wallet.network}</li>
        <li><strong>Address:</strong> <code style="color:#e2e8f0;">${masked}</code></li>
      </ul>
      <p>Enter this code to confirm and save the wallet:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:0.35em;color:#ffffff;margin:16px 0;">${code}</p>
      <p style="color:#94a3b8;font-size:14px;">This code expires in 10 minutes. If you did not request this, secure your account and ignore this email.</p>`,
    );

    return this.email.send({
      to,
      subject: `${code} — verify your withdrawal wallet`,
      html,
      text: `Your withdrawal wallet verification code is ${code}. Wallet: ${wallet.label} (${wallet.network}) ${masked}. Expires in 10 minutes.`,
    });
  }

  private async sendWithdrawalOtp(
    email: string,
    code: string,
    details: {
      amount: number;
      walletLabel: string;
      network: string;
      address: string;
    },
  ) {
    const to = email.trim().toLowerCase();
    const masked =
      details.address.length > 12
        ? `${details.address.slice(0, 6)}…${details.address.slice(-4)}`
        : details.address;
    const amountLabel = `$${Number(details.amount).toFixed(2)} USDT`;
    const html = this.email.layout(
      'Confirm your withdrawal',
      `<p>You requested a withdrawal from TraderRank Pro:</p>
      <ul style="color:#cbd5e1;padding-left:1.2rem;">
        <li><strong>Amount:</strong> ${amountLabel}</li>
        <li><strong>To:</strong> ${details.walletLabel} (${details.network})</li>
        <li><strong>Address:</strong> <code style="color:#e2e8f0;">${masked}</code></li>
      </ul>
      <p>Enter this code to authorize the withdrawal:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:0.35em;color:#ffffff;margin:16px 0;">${code}</p>
      <p style="color:#94a3b8;font-size:14px;">This code expires in 10 minutes. If you did not request a withdrawal, secure your account and ignore this email.</p>`,
    );

    return this.email.send({
      to,
      subject: `${code} — confirm your ${amountLabel} withdrawal`,
      html,
      text: `Your withdrawal code is ${code}. Amount: ${amountLabel} → ${details.walletLabel} (${details.network}) ${masked}. Expires in 10 minutes.`,
    });
  }

  private async sendWalletTransferOtp(
    email: string,
    code: string,
    details: {
      amount: number;
      recipientEmail: string;
      recipientName: string;
    },
  ) {
    const to = email.trim().toLowerCase();
    const amountLabel = `$${Number(details.amount).toFixed(2)} USDT`;
    const html = this.email.layout(
      'Confirm your wallet transfer',
      `<p>You requested an internal transfer from TraderRank Pro:</p>
      <ul style="color:#cbd5e1;padding-left:1.2rem;">
        <li><strong>Amount:</strong> ${amountLabel}</li>
        <li><strong>To:</strong> ${this.escape(details.recipientName)} (${this.escape(details.recipientEmail)})</li>
      </ul>
      <p>Enter this code to authorize the transfer:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:0.35em;color:#ffffff;margin:16px 0;">${code}</p>
      <p style="color:#94a3b8;font-size:14px;">This code expires in 10 minutes. If you did not request a transfer, secure your account and ignore this email.</p>`,
    );
    return this.email.send({
      to,
      subject: `${code} — confirm your ${amountLabel} transfer`,
      html,
      text: `Your transfer code is ${code}. Amount: ${amountLabel} → ${details.recipientName} (${details.recipientEmail}). Expires in 10 minutes.`,
    });
  }

  private async sendWalletTransferReceived(
    userId: string,
    data: { amount: number; fromName: string; fromEmail: string | null },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const fromLabel = data.fromEmail
      ? `${data.fromName} (${data.fromEmail})`
      : data.fromName;
    const html = this.email.layout(
      'You received a wallet transfer',
      `<p>Hi ${this.escape(user.name)},</p>
      <p><strong>$${data.amount.toFixed(2)} USDT</strong> was transferred to your platform wallet from <strong>${this.escape(fromLabel)}</strong>.</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'Open wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Received $${data.amount.toFixed(2)} USDT wallet transfer`,
      html,
      text: `You received $${data.amount.toFixed(2)} USDT from ${fromLabel}. Open ${this.email.frontendUrl}/wallet`,
    });
  }

  private async sendPeerChatMessage(
    userId: string,
    data: { fromName: string; preview: string; conversationId: string },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const preview =
      data.preview.length > 160
        ? `${data.preview.slice(0, 157)}…`
        : data.preview;
    const html = this.email.layout(
      'New private message',
      `<p>Hi ${this.escape(user.name)},</p>
      <p><strong>${this.escape(data.fromName)}</strong> sent you a message:</p>
      <p style="color:#cbd5e1;">${this.escape(preview)}</p>
      ${this.email.button(
        `${this.email.frontendUrl}/chat?c=${encodeURIComponent(data.conversationId)}`,
        'Open chat',
      )}`,
    );
    return this.email.send({
      to: user.email,
      subject: `New message from ${data.fromName}`,
      html,
      text: `${data.fromName}: ${preview}\nOpen ${this.email.frontendUrl}/chat?c=${data.conversationId}`,
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
    data: {
      symbol: string;
      reward: number;
      signalId: string;
      walletBalance?: number;
    },
  ) {
    this.dispatch(this.sendTpClaimApproved(userId, data), 'TP claim approved');
  }

  private async sendTpClaimApproved(
    userId: string,
    data: {
      symbol: string;
      reward: number;
      signalId: string;
      walletBalance?: number;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const balanceLine =
      data.walletBalance != null
        ? `<p>New wallet balance: <strong>$${data.walletBalance.toFixed(2)} USDT</strong></p>`
        : '';

    const credited =
      data.walletBalance != null
        ? `<p><strong>$${data.reward.toFixed(2)} USDT</strong> has been credited to your platform wallet.</p>
      ${balanceLine}
      <p>Withdraw anytime from the Wallet page (KYC required for withdrawals).</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`
        : `<p>Your claim for <strong>$${data.reward.toFixed(2)} USDT</strong> passed review.</p>
      <p>An admin will finalize the reward from the payouts queue — you’ll get another email when it hits your wallet.</p>
      ${this.email.button(`${this.email.frontendUrl}/tp-claims`, 'View TP claims')}`;

    const html = this.email.layout(
      'TP claim approved',
      `<p>Hi ${user.name},</p>
      <p>Your take-profit claim for <strong>${data.symbol}</strong> was approved.</p>
      ${credited}`,
    );

    const subject =
      data.walletBalance != null
        ? `TP claim approved — $${data.reward.toFixed(2)} USDT in your wallet`
        : `TP claim approved — $${data.reward.toFixed(2)} USDT awaiting payout`;
    const text =
      data.walletBalance != null
        ? `Your TP claim for ${data.symbol} was approved. $${data.reward.toFixed(2)} USDT credited to your platform wallet.`
        : `Your TP claim for ${data.symbol} was approved. $${data.reward.toFixed(2)} USDT will be credited after payout approval.`;

    return this.email.send({
      to: user.email,
      subject,
      html,
      text,
    });
  }

  tpClaimRejected(userId: string, data: { symbol: string; reason: string }) {
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
    this.dispatch(
      this.sendTp1ClaimAvailable(userId, data),
      'TP1 claim available',
    );
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

  payoutCreditedToWallet(
    userId: string,
    data: {
      amount: number;
      balance: number;
      weekNumber: number;
      year: number;
      source: string;
    },
  ) {
    this.dispatch(
      this.sendPayoutCreditedToWallet(userId, data),
      'Payout credited to wallet',
    );
  }

  private async sendPayoutCreditedToWallet(
    userId: string,
    data: {
      amount: number;
      balance: number;
      weekNumber: number;
      year: number;
      source: string;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const html = this.email.layout(
      'Reward credited',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your reward have been credited to your wallet.</p>
      <p><strong>$${data.amount.toFixed(2)} USDT</strong> — new balance: <strong>$${data.balance.toFixed(2)} USDT</strong></p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );

    return this.email.send({
      to: user.email,
      subject: 'Your reward have been credited to your wallet',
      html,
      text: 'Your reward have been credited to your wallet.',
    });
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

  /** Admin marked whitelist user verified — welcome to the top 1%. */
  whitelistVerified(userId: string) {
    this.dispatch(
      this.sendWhitelistVerified(userId),
      'Whitelist verified welcome',
    );
  }

  investorVvipActivated(userId: string) {
    this.dispatch(this.sendInvestorVvipActivated(userId), 'VVIP activated');
    this.dispatch(
      this.sendInvestorVvipActivatedAdmin(userId),
      'VVIP activated admin copy',
    );
  }

  private async sendInvestorVvipActivated(userId: string) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const html = this.email.layout(
      'Welcome to VVIP',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your account has been upgraded to <strong>VVIP</strong> on Tradeguard.</p>
      <ul style="margin:16px 0;padding-left:20px;color:#cbd5e1;">
        <li><strong>Instant withdrawals</strong> — no admin approval; sent automatically to your saved wallet</li>
        <li><strong>Anytime</strong> — withdraw any day, any hour with <strong>$0</strong> processing fee and no off-schedule penalty</li>
        <li><strong>Free reinvest</strong> — move wallet balance into Smart Invest anytime from Invest with no commission</li>
      </ul>
      <p style="color:#94a3b8;font-size:14px;">Use Wallet to withdraw and Invest to reinvest. Message Support if you need help.</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'Open wallet')}`,
    );

    return this.email.send({
      to: user.email,
      subject: 'Your VVIP privileges are active',
      html,
      text: `Hi ${user.name}, your Tradeguard account is now VVIP: instant withdrawals anytime with $0 fees, and free self-serve reinvest from wallet to Smart Invest. Open ${this.email.frontendUrl}/wallet`,
    });
  }

  private async sendInvestorVvipActivatedAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user) return false;

    const userLine = user.email
      ? `${this.escape(user.displayName)} (${this.escape(user.email)})`
      : this.escape(user.displayName);

    const html = this.email.layout(
      'VVIP member activated',
      `<p>A user was granted <strong>VVIP</strong> privileges.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">User</td><td style="padding:6px 0;"><strong>${userLine}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Privileges</td><td style="padding:6px 0;">Instant withdraw anytime · $0 fees · free self-serve reinvest</td></tr>
      </table>`,
    );

    return this.sendOpsAlert({
      label: 'VVIP activated admin',
      subject: `[VVIP] ${user.displayName} — privileges activated`,
      html,
      text: `VVIP activated for ${user.displayName} (${user.email ?? 'no email'}). Instant withdraw anytime, $0 fees, free reinvest.`,
    });
  }

  private async sendWhitelistVerified(userId: string) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const html = this.email.layout(
      'Welcome to the top 1%',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Welcome to the <strong>1%</strong> of successful members on Tradeguard.</p>
      <p>Your account has been marked <strong>verified</strong>. You can withdraw without completing document KYC, and you keep instant-withdraw privileges.</p>
      <p>Thank you for being part of this circle — stay consistent, grow your capital, and reach out in Messages if you need anything.</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'Open wallet')}`,
    );

    return this.email.send({
      to: user.email,
      subject: 'Welcome to the 1% of successful members',
      html,
      text: `Hi ${user.name}, welcome to the 1% of successful members on Tradeguard. Your account is verified — you can withdraw without document KYC. Open ${this.email.frontendUrl}/wallet`,
    });
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

  chainContractKycApproved(userId: string) {
    this.dispatch(
      this.sendChainContractKycApproved(userId),
      'Blockchain contract KYC approved',
    );
  }

  private async sendChainContractKycApproved(userId: string) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const html = this.email.layout(
      'Blockchain verification approved',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your blockchain contract identity verification has been <strong>approved</strong>.</p>
      <p>You can now choose how to fund your account:</p>
      <ul>
        <li><strong>Smart Invest:</strong> deposit with USDT or use your platform wallet. Daily earnings appear in the platform and are emailed after each credit.</li>
        <li><strong>Platform wallet:</strong> deposit USDT first, then allocate it to Smart Invest.</li>
      </ul>
      <p>New investment allocations begin earning after the platform's 24-hour holding period.</p>
      ${this.email.button(`${this.email.frontendUrl}/blockchain`, 'View deposit options')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Blockchain KYC approved — choose a deposit option',
      html,
      text: `Your blockchain KYC was approved. Choose a deposit option at ${this.email.frontendUrl}/blockchain. Smart Invest daily earnings appear in the platform and are emailed after each credit.`,
    });
  }

  chainContractKycRejected(userId: string, reason: string) {
    this.dispatch(
      this.sendChainContractKycRejected(userId, reason),
      'Blockchain contract KYC rejected',
    );
  }

  chainContractEnrollmentClosed(
    userId: string,
    data: { reason: string; reapplyBlockedUntil: string; adminId?: string },
  ) {
    this.dispatch(
      this.sendChainContractEnrollmentClosed(userId, data),
      'Blockchain enrollment closed',
    );
  }

  private async sendChainContractEnrollmentClosed(
    userId: string,
    data: { reason: string; reapplyBlockedUntil: string; adminId?: string },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const reapplyLabel = new Date(data.reapplyBlockedUntil).toLocaleString(
      'en-GB',
      {
        timeZone: 'Africa/Kampala',
        dateStyle: 'medium',
        timeStyle: 'short',
      },
    );
    const html = this.email.layout(
      'Blockchain enrollment closed',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your <strong>blockchain contract enrollment</strong> has been closed. Your Smart Invest and wallet accounts are <strong>not affected</strong> — only the on-chain program.</p>
      <p><strong>Reason:</strong> ${this.escape(data.reason)}</p>
      <p style="color:#94a3b8;font-size:14px;">You may start a new blockchain application after <strong>${this.escape(reapplyLabel)}</strong> (Africa/Kampala). Until then, the blockchain deposit option will stay unavailable.</p>
      <p style="color:#64748b;font-size:13px;">Minimum deposit when you re-apply: $2,000 USDT (plus enrollment fee).</p>`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Blockchain enrollment closed — re-apply after 10 days',
      html,
      text: `Blockchain enrollment closed: ${data.reason}. Re-apply after ${reapplyLabel}. Smart Invest and wallet are unchanged.`,
    });
  }

  private async sendChainContractKycRejected(userId: string, reason: string) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const safeReason = this.escape(reason);
    const html = this.email.layout(
      'Blockchain verification needs resubmission',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your blockchain contract KYC submission could not be approved.</p>
      <p><strong>Reason:</strong> ${safeReason}</p>
      <p>Open Blockchain, correct the documents, and submit again.</p>
      ${this.email.button(`${this.email.frontendUrl}/blockchain`, 'Resubmit verification')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Blockchain KYC update — please resubmit',
      html,
      text: `Blockchain KYC rejected: ${reason}. Resubmit at ${this.email.frontendUrl}/blockchain.`,
    });
  }

  chainVaultFunded(
    userId: string,
    data: {
      amount: number;
      fee?: number;
      gross?: number;
      feePercent?: number;
      lockedUntil: string;
    },
  ) {
    this.dispatch(
      this.sendChainVaultFunded(userId, data),
      'Blockchain wallet funded',
    );
  }

  private async sendChainVaultFunded(
    userId: string,
    data: {
      amount: number;
      fee?: number;
      gross?: number;
      feePercent?: number;
      lockedUntil: string;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const unlockDate = new Date(data.lockedUntil).toLocaleString('en-US', {
      timeZone: 'Africa/Kampala',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const fee = Number(data.fee ?? 0);
    const gross = Number(data.gross ?? data.amount + fee);
    const feePercent = Number(data.feePercent ?? 10);
    const feeLine =
      fee > 0
        ? `<p>Enrollment fee: <strong>$${fee.toFixed(2)} USDT</strong> (${feePercent}% of $${gross.toFixed(2)}). Net invested: <strong>$${data.amount.toFixed(2)} USDT</strong>.</p>`
        : '';
    const html = this.email.layout(
      'Blockchain wallet funded',
      `<p>Hi ${this.escape(user.name)},</p>
      <p><strong>$${gross.toFixed(2)} USDT</strong> left your platform wallet for blockchain investment.</p>
      ${feeLine}
      <p>Your principal and all profit are locked for five business days (weekends excluded), until <strong>${this.escape(unlockDate)} (Kampala time)</strong>.</p>
      <p>Daily profit is shown in Blockchain and emailed after each credit. You can withdraw principal and profit back to your platform wallet after unlock.</p>
      ${this.email.button(`${this.email.frontendUrl}/blockchain`, 'View blockchain wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Blockchain wallet funded — $${data.amount.toFixed(2)} locked for 5 business days`,
      html,
      text: `$${gross.toFixed(2)} USDT moved from platform wallet (${feePercent}% fee $${fee.toFixed(2)}; $${data.amount.toFixed(2)} invested). Principal and profit unlock ${unlockDate} Kampala time.`,
    });
  }

  chainVaultDailyProfit(
    userId: string,
    data: {
      amount: number;
      yieldPercent: number;
      principal: number;
      lockedUntil: string;
    },
  ) {
    this.dispatch(
      this.sendChainVaultDailyProfit(userId, data),
      'Blockchain daily profit',
    );
  }

  airfarmingDropPaid(
    userId: string,
    data: { amount: number; source: string; percent?: number },
  ) {
    this.dispatch(this.sendAirfarmingDropPaid(userId, data), 'Airfarming drop paid');
  }

  airfarmingApplicationSubmitted(
    userId: string,
    data: AirfarmingApplicationEmailData,
  ) {
    this.dispatch(
      this.sendAirfarmingApplicationSubmitted(userId, data),
      'Airfarming application submitted',
    );
  }

  airfarmingApplicationSubmittedAdmin(
    userId: string,
    data: AirfarmingApplicationEmailData,
  ) {
    this.dispatch(
      this.sendAirfarmingApplicationSubmittedAdmin(userId, data),
      'Airfarming application admin',
    );
  }

  airfarmingApplicationApproved(userId: string) {
    this.dispatch(
      this.sendAirfarmingApplicationApproved(userId),
      'Airfarming application approved',
    );
  }

  airfarmingApplicationRejected(userId: string, reason: string) {
    this.dispatch(
      this.sendAirfarmingApplicationRejected(userId, reason),
      'Airfarming application rejected',
    );
  }

  private async sendAirfarmingApplicationSubmitted(
    userId: string,
    data: AirfarmingApplicationEmailData,
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Airfarming application received',
      `<p>Hi ${this.escape(data.fullName)},</p>
      <p>We received your <strong>Airfarming</strong> enrollment application.</p>
      <ul style="color:#94a3b8;font-size:14px;padding-left:20px;line-height:1.6;">
        <li>Planned investment: <strong style="color:#e8eaed;">$${data.plannedInvestmentUsd.toFixed(2)} USDT</strong></li>
        <li>Preferred withdraw cadence: <strong style="color:#e8eaed;">${this.escape(airfarmingWithdrawLabel(data.withdrawPreference))}</strong></li>
        <li>Location: ${this.escape(data.location)}</li>
      </ul>
      <p style="color:#94a3b8;font-size:14px;">Our team will review your application. <strong>Once approved, you will receive an email for every Airfarming activity</strong> — drops credited, float moves, and weekly floor progress.</p>`,
    );
    return this.email.send({
      to: data.email,
      subject: 'Airfarming application received',
      html,
      text: `Airfarming application received. Planned investment $${data.plannedInvestmentUsd.toFixed(2)}. Once approved you will be emailed about every activity.`,
    });
  }

  private async sendAirfarmingApplicationSubmittedAdmin(
    userId: string,
    data: AirfarmingApplicationEmailData,
  ) {
    const html = this.email.layout(
      'Airfarming application pending',
      `<p><strong>${this.escape(data.fullName)}</strong> applied for Airfarming.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        <tr><td style="padding:6px 0;color:#94a3b8;">Email</td><td>${this.escape(data.email)}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Age</td><td>${data.age}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Location</td><td>${this.escape(data.location)}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Planned invest</td><td>$${data.plannedInvestmentUsd.toFixed(2)} USDT</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Withdraw</td><td>${this.escape(airfarmingWithdrawLabel(data.withdrawPreference))}</td></tr>
      </table>
      <p>Approve or reject before they can allocate.</p>`,
    );
    return this.sendOpsAlert({
      label: 'Airfarming application',
      subject: `[Airfarming] Application — ${data.fullName}`,
      html,
      text: `${data.fullName} (${data.email}) applied — $${data.plannedInvestmentUsd.toFixed(2)}, ${data.withdrawPreference} withdraw, ${data.location}.`,
    });
  }

  private async sendAirfarmingApplicationApproved(userId: string) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Airfarming enrollment approved',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your <strong>Airfarming</strong> application was <strong>approved</strong>.</p>
      <p>You can now commit cash from your wallet and start receiving scheduled yield drops.</p>
      <p style="color:#94a3b8;font-size:14px;">You will receive an email for <strong>every Airfarming activity</strong> — each drop, catch-up credit, and important account updates.</p>
      ${this.email.button(`${this.email.frontendUrl}/airfarming`, 'Open Airfarming')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Airfarming enrollment approved',
      html,
      text: 'Your Airfarming application was approved. Open the Airfarming page to allocate funds.',
    });
  }

  private async sendAirfarmingApplicationRejected(userId: string, reason: string) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Airfarming application update',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your Airfarming application could not be approved at this time.</p>
      <p><strong>Reason:</strong> ${this.escape(reason)}</p>
      <p style="color:#94a3b8;font-size:14px;">You may submit a new application from the Airfarming page if your situation changes.</p>
      ${this.email.button(`${this.email.frontendUrl}/airfarming`, 'Airfarming')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Airfarming application — please reapply later',
      html,
      text: `Airfarming application not approved: ${reason}`,
    });
  }

  private async sendAirfarmingDropPaid(
    userId: string,
    data: { amount: number; source: string; percent?: number },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const label =
      data.source === 'week_floor_catchup'
        ? 'weekly floor catch-up'
        : 'Airfarming drop';
    const html = this.email.layout(
      'Airfarming yield credited',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your <strong>${this.escape(label)}</strong> credited <strong>$${data.amount.toFixed(2)} USDT</strong> to your cash wallet.</p>
      ${data.percent != null && data.percent > 0 ? `<p style="color:#94a3b8;font-size:14px;">Rate: ${data.percent}% on eligible balance.</p>` : ''}
      ${this.email.button(`${this.email.frontendUrl}/airfarming`, 'View Airfarming')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Airfarming — $${data.amount.toFixed(2)} USDT credited`,
      html,
      text: `Airfarming credited $${data.amount.toFixed(2)} USDT to your cash wallet.`,
    });
  }

  private async sendChainVaultDailyProfit(
    userId: string,
    data: {
      amount: number;
      yieldPercent: number;
      principal: number;
      lockedUntil: string;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Blockchain daily profit credited',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your blockchain wallet earned <strong>$${data.amount.toFixed(2)} USDT</strong> at the current ${data.yieldPercent}% daily rate on $${data.principal.toFixed(2)} principal.</p>
      <p>The profit is held in your blockchain wallet and follows the same five business-day lock as your principal.</p>
      ${this.email.button(`${this.email.frontendUrl}/blockchain`, 'View profit history')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Blockchain daily profit — $${data.amount.toFixed(2)} USDT`,
      html,
      text: `Blockchain daily profit: $${data.amount.toFixed(2)} USDT at ${data.yieldPercent}% on $${data.principal.toFixed(2)} principal.`,
    });
  }

  chainVaultWithdrawn(
    userId: string,
    data: { gross: number; fee: number; net: number; walletBalance: number },
  ) {
    this.dispatch(
      this.sendChainVaultWithdrawn(userId, data),
      'Blockchain wallet withdrawn',
    );
  }

  chainContractPermanentlyClosed(userId: string) {
    this.dispatch(
      this.sendChainContractPermanentlyClosed(userId),
      'Blockchain contract permanently closed',
    );
  }

  private async sendChainContractPermanentlyClosed(userId: string) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Blockchain contract closed',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>You withdrew your full blockchain contract balance. Under platform policy, <strong>a launched contract cannot be emptied and reopened</strong>.</p>
      <p>This enrollment is <strong>permanently closed</strong> — you <strong>cannot apply for a new blockchain contract</strong> on this account.</p>
      <p>Smart Invest and your platform wallet are unchanged.</p>
      ${this.email.button(`${this.email.frontendUrl}/invest`, 'Open Smart Invest')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Blockchain contract closed — re-enrollment not available',
      html,
      text: `Your blockchain contract was fully withdrawn and permanently closed. You cannot apply again. Smart Invest and wallet are unchanged. ${this.email.frontendUrl}/invest`,
    });
  }

  chainVaultWeekendAdjustment(
    userId: string,
    data: {
      removedProfit: number;
      newPrincipal: number;
      previousPrincipal: number;
      lockedUntil: string;
    },
  ) {
    this.dispatch(
      this.sendChainVaultWeekendAdjustment(userId, data),
      'Blockchain contract weekend adjustment',
    );
  }

  private async sendChainVaultWeekendAdjustment(
    userId: string,
    data: {
      removedProfit: number;
      newPrincipal: number;
      previousPrincipal: number;
      lockedUntil: string;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const unlockDate = new Date(data.lockedUntil).toLocaleString('en-US', {
      timeZone: 'Africa/Kampala',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const html = this.email.layout(
      'Contract balance adjusted',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>We updated your blockchain contract to match platform policy: <strong>no daily profit on Saturdays or Sundays</strong>, and lock periods count <strong>business days only</strong> (weekends excluded).</p>
      <p>Weekend profit removed from your contract: <strong>$${data.removedProfit.toFixed(2)} USDT</strong>.</p>
      <p>Contract principal: <strong>$${data.previousPrincipal.toFixed(2)}</strong> → <strong>$${data.newPrincipal.toFixed(2)} USDT</strong>.</p>
      <p>Your full balance remains locked until <strong>${this.escape(unlockDate)} (Kampala time)</strong> — five business days from your latest contract reset.</p>
      <p>Daily profit continues on weekdays only. After unlock you can withdraw principal and profit to your platform wallet.</p>
      ${this.email.button(`${this.email.frontendUrl}/blockchain`, 'View blockchain wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Contract adjustment — $${data.removedProfit.toFixed(2)} weekend profit removed`,
      html,
      text: `Weekend contract profit removed: $${data.removedProfit.toFixed(2)} USDT. Principal now $${data.newPrincipal.toFixed(2)} USDT. Unlocks ${unlockDate} Kampala time.`,
    });
  }

  private async sendChainVaultWithdrawn(
    userId: string,
    data: { gross: number; fee: number; net: number; walletBalance: number },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Blockchain withdrawal complete',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>You withdrew <strong>$${data.gross.toFixed(2)} USDT</strong> from your blockchain wallet.</p>
      <p>Fee: <strong>$${data.fee.toFixed(2)}</strong> · Credited to platform wallet: <strong>$${data.net.toFixed(2)} USDT</strong>.</p>
      <p>Platform wallet balance: <strong>$${data.walletBalance.toFixed(2)} USDT</strong>.</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'Open platform wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Blockchain withdrawal complete — $${data.net.toFixed(2)} credited`,
      html,
      text: `Blockchain withdrawal: $${data.gross.toFixed(2)} gross, $${data.fee.toFixed(2)} fee, $${data.net.toFixed(2)} credited to platform wallet.`,
    });
  }

  accountActivated(userId: string) {
    this.dispatch(this.sendAccountActivated(userId), 'Account activated');
    this.dispatch(
      this.sendRegistrationAdminAlert(userId, 'activated'),
      'Admin registration activated alert',
    );
  }

  /** New signup (before payment) — ops visibility. */
  userRegistered(userId: string) {
    this.dispatch(
      this.sendRegistrationAdminAlert(userId, 'signed_up'),
      'Admin registration signup alert',
    );
  }

  private async sendRegistrationAdminAlert(
    userId: string,
    kind: 'signed_up' | 'activated',
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        displayName: true,
        createdAt: true,
        registrationPaid: true,
      },
    });
    if (!user) return false;

    const userLine = user.email
      ? `${this.escape(user.displayName)} (${this.escape(user.email)})`
      : this.escape(user.displayName);
    const title =
      kind === 'activated'
        ? 'Registration completed — account active'
        : 'New user registered';
    const html = this.email.layout(
      title,
      `<p>${kind === 'activated' ? 'A user finished registration and is now active.' : 'A new user signed up and needs registration payment (or promo).'}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">User</td><td style="padding:6px 0;"><strong>${userLine}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Registration paid</td><td style="padding:6px 0;"><strong>${user.registrationPaid ? 'Yes' : 'No'}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Signed up</td><td style="padding:6px 0;"><strong>${user.createdAt.toISOString()}</strong></td></tr>
      </table>`,
    );

    return this.sendOpsAlert({
      label: `Ops alert: registration ${kind} — ${user.displayName}`,
      subject:
        kind === 'activated'
          ? `Account activated — ${user.displayName}`
          : `New signup — ${user.displayName}`,
      html,
      text: `${title}: ${user.displayName} <${user.email ?? 'no-email'}>`,
    });
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
      sourceRank?: number;
      symbol: string;
      direction: string;
      reason: string;
      riskPercent: number;
      entryMin?: number;
      entryMax?: number;
      entryPrice?: number;
      stopLoss?: number;
      takeProfit?: number;
      tp1Price?: number;
      volume?: number | null;
      orderType?: string;
      pending?: boolean;
    },
  ) {
    this.dispatch(
      this.sendCopyTradeBlocked(toEmail, data),
      'Copy trade blocked',
    );
  }

  copyPoolHealthDegraded(
    toEmail: string,
    data: {
      message: string;
      copyAccountId: string | null;
      leaderCount: number;
      riskPercent: number;
    },
  ) {
    this.dispatch(
      this.sendCopyPoolHealthDegraded(toEmail, data),
      'Copy pool health degraded',
    );
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
    this.dispatch(
      this.sendCopyBreakevenHit(toEmail, data),
      'Copy breakeven hit',
    );
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

  /** MT5 Copy trade placed from POST /feeds/signals (external API ingest). */
  apiFeedCopyTradePlaced(
    toEmail: string,
    data: {
      signalId: string;
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
      pending: boolean;
      comment?: string | null;
      pairAdjustments: string[];
    },
  ) {
    this.dispatch(
      this.sendApiFeedCopyTradePlaced(toEmail, data),
      'API feed copy trade placed',
    );
  }

  /** MT5 Copy could not mirror an external API signal. */
  apiFeedCopyTradeFailed(
    toEmail: string,
    data: {
      signalId: string;
      symbol: string;
      direction: string;
      reason: string;
      comment?: string | null;
      riskPercent: number;
      entryMin?: number;
      entryMax?: number;
      entryPrice?: number;
      stopLoss?: number;
      takeProfit?: number;
      tp1Price?: number;
      volume?: number | null;
      orderType?: string;
      pending?: boolean;
    },
  ) {
    this.dispatch(
      this.sendApiFeedCopyTradeFailed(toEmail, data),
      'API feed copy trade failed',
    );
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

  private formatManualTradeRows(data: {
    symbol: string;
    direction: string;
    entryMin?: number;
    entryMax?: number;
    entryPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    tp1Price?: number;
    volume?: number | null;
    orderType?: string;
    pending?: boolean;
  }): string {
    const rows: Array<[string, string]> = [];
    if (data.orderType) {
      rows.push(['Order type', data.pending ? data.orderType : 'market']);
    }
    if (data.volume != null && Number.isFinite(data.volume)) {
      rows.push(['Suggested volume', `${data.volume} lots`]);
    }
    if (
      data.entryMin != null &&
      data.entryMax != null &&
      Number.isFinite(data.entryMin) &&
      Number.isFinite(data.entryMax)
    ) {
      rows.push(['Entry zone', `${data.entryMin} – ${data.entryMax}`]);
    }
    if (data.entryPrice != null && Number.isFinite(data.entryPrice)) {
      rows.push(['Entry / open', String(data.entryPrice)]);
    }
    if (data.stopLoss != null && Number.isFinite(data.stopLoss)) {
      rows.push(['Stop loss', String(data.stopLoss)]);
    }
    if (data.takeProfit != null && Number.isFinite(data.takeProfit)) {
      rows.push(['Take profit', String(data.takeProfit)]);
    }
    if (data.tp1Price != null && Number.isFinite(data.tp1Price)) {
      rows.push(['TP1 (1:1)', String(data.tp1Price)]);
    }
    if (rows.length === 0) return '';
    const tableRows = rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:6px 0;color:#94a3b8;">${this.escape(label)}</td><td style="padding:6px 0;"><strong>${this.escape(value)}</strong></td></tr>`,
      )
      .join('');
    return `<p style="margin:16px 0 8px;color:#e2e8f0;font-weight:600;">Execute manually in MT5</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">${tableRows}</table>
      <p style="color:#94a3b8;font-size:14px;">Place this trade on your copy MT5 account with the levels above if you want to mirror the setup while auto-copy is blocked.</p>`;
  }

  private async sendCopyPoolHealthDegraded(
    toEmail: string,
    data: {
      message: string;
      copyAccountId: string | null;
      leaderCount: number;
      riskPercent: number;
    },
  ) {
    const to = toEmail.trim().toLowerCase();
    if (!to) return false;

    const accountLabel = data.copyAccountId
      ? `${data.copyAccountId.slice(0, 8)}…`
      : 'Not configured';

    const html = this.email.layout(
      'Copy pool offline — auto-mirror paused',
      `<p>The MT5 copy pool is <strong>not ready</strong> to receive trades. This is an infrastructure alert — not a missed setup.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">Status</td><td style="padding:6px 0;"><strong>${this.escape(data.message)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Copy account</td><td style="padding:6px 0;"><strong>${this.escape(accountLabel)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Pool traders</td><td style="padding:6px 0;"><strong>${data.leaderCount}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Risk cap</td><td style="padding:6px 0;"><strong>${data.riskPercent}%</strong></td></tr>
      </table>
      <p style="color:#94a3b8;font-size:14px;">While the pool is offline, new setups from copy-pool traders are <strong>not</strong> sent to MT5. Each blocked setup triggers a separate email with full symbol, direction, entry, SL, and TP so you can place it manually if you choose.</p>
      <p style="color:#94a3b8;font-size:14px;">Common fixes: enable Algo Trading in MT5, confirm the copy account is not read-only, and verify the broker allows trading on that login.</p>`,
    );

    return this.email.send({
      to,
      subject: `Copy pool offline — ${data.message.slice(0, 72)}`,
      html,
      text: `Copy pool offline: ${data.message}. Account ${accountLabel}, ${data.leaderCount} trader(s) in pool.`,
    });
  }

  private async sendCopyTradeBlocked(
    toEmail: string,
    data: {
      signalId: string;
      sourceName: string;
      sourceRank?: number;
      symbol: string;
      direction: string;
      reason: string;
      riskPercent: number;
      entryMin?: number;
      entryMax?: number;
      entryPrice?: number;
      stopLoss?: number;
      takeProfit?: number;
      tp1Price?: number;
      volume?: number | null;
      orderType?: string;
      pending?: boolean;
    },
  ) {
    const to = toEmail.trim().toLowerCase();
    if (!to) return false;

    const sourceLabel =
      data.sourceRank != null && data.sourceRank > 0
        ? `#${data.sourceRank} ${data.sourceName}`
        : data.sourceName;
    const manualBlock = this.formatManualTradeRows(data);

    const html = this.email.layout(
      'Copy trade blocked — place manually if needed',
      `<p>A setup from <strong>${this.escape(sourceLabel)}</strong> was <strong>not</strong> copied to the MT5 pool.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">Setup</td><td style="padding:6px 0;"><strong>${this.escape(data.signalId)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Symbol</td><td style="padding:6px 0;"><strong>${this.escape(data.symbol)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Direction</td><td style="padding:6px 0;"><strong>${this.escape(data.direction)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Max risk</td><td style="padding:6px 0;"><strong>${data.riskPercent}%</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Reason</td><td style="padding:6px 0;"><strong>${this.escape(data.reason)}</strong></td></tr>
      </table>
      ${manualBlock}
      <p style="color:#94a3b8;font-size:14px;">One trade per setup is enforced — no order was sent automatically.</p>`,
    );

    const manualText = [
      data.volume != null ? `${data.volume} lots` : null,
      data.entryPrice != null ? `entry ${data.entryPrice}` : null,
      data.stopLoss != null ? `SL ${data.stopLoss}` : null,
      data.takeProfit != null ? `TP ${data.takeProfit}` : null,
    ]
      .filter(Boolean)
      .join(', ');

    return this.email.send({
      to,
      subject: `Copy blocked — ${data.symbol} ${data.direction}${manualText ? ` (${manualText})` : ''}`,
      html,
      text: `Copy trade blocked for ${data.signalId}: ${data.reason}. Manual: ${data.symbol} ${data.direction}${manualText ? ` — ${manualText}` : ''}.`,
    });
  }

  private async sendApiFeedCopyTradePlaced(
    toEmail: string,
    data: {
      signalId: string;
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
      pending: boolean;
      comment?: string | null;
      pairAdjustments: string[];
    },
  ) {
    const to = toEmail.trim().toLowerCase();
    if (!to) return false;

    const commentBlock = data.comment?.trim()
      ? `<tr><td style="padding:6px 0;color:#94a3b8;">Signal comment</td><td style="padding:6px 0;"><strong>${this.escape(data.comment.trim())}</strong></td></tr>`
      : '';
    const adjustments = data.pairAdjustments
      .map((line) => `<li>${this.escape(line)}</li>`)
      .join('');
    const statusLabel = data.pending
      ? 'Pending limit on MT5 Copy'
      : 'Live on MT5 Copy';

    const html = this.email.layout(
      'API signal → MT5 Copy trade',
      `<p>An external API signal was mirrored to the <strong>MT5 Copy</strong> account.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">Setup ID</td><td style="padding:6px 0;"><strong>${this.escape(data.signalId)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Symbol</td><td style="padding:6px 0;"><strong>${this.escape(data.symbol)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Direction</td><td style="padding:6px 0;"><strong>${this.escape(data.direction)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Status</td><td style="padding:6px 0;"><strong>${statusLabel}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Order type</td><td style="padding:6px 0;"><strong>${this.escape(data.orderType)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Volume</td><td style="padding:6px 0;"><strong>${data.volume} lots</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Entry</td><td style="padding:6px 0;"><strong>${data.entryPrice}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Stop loss</td><td style="padding:6px 0;"><strong>${data.stopLoss}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Take profit</td><td style="padding:6px 0;"><strong>${data.takeProfit}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Risk cap</td><td style="padding:6px 0;"><strong>${data.riskPercent}% (${data.riskCapAmount.toFixed(2)} ${this.escape(data.currency)})</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Est. loss at SL</td><td style="padding:6px 0;"><strong>${data.estimatedLossAtSl.toFixed(2)} ${this.escape(data.currency)}</strong></td></tr>
        ${commentBlock}
      </table>
      <p style="color:#94a3b8;font-size:14px;">Pair sizing notes:</p>
      <ul style="color:#94a3b8;font-size:14px;padding-left:20px;">${adjustments}</ul>`,
    );

    return this.email.send({
      to,
      subject: `API → MT5 Copy: ${data.symbol} ${data.direction} (${data.volume} lots)`,
      html,
      text: `API signal mirrored to MT5 Copy: ${data.signalId}. ${data.symbol} ${data.direction} ${data.volume} lots @ ${data.entryPrice}, SL ${data.stopLoss}, TP ${data.takeProfit}. ${statusLabel}.`,
    });
  }

  private async sendApiFeedCopyTradeFailed(
    toEmail: string,
    data: {
      signalId: string;
      symbol: string;
      direction: string;
      reason: string;
      comment?: string | null;
      riskPercent: number;
      entryMin?: number;
      entryMax?: number;
      entryPrice?: number;
      stopLoss?: number;
      takeProfit?: number;
      tp1Price?: number;
      volume?: number | null;
      orderType?: string;
      pending?: boolean;
    },
  ) {
    const to = toEmail.trim().toLowerCase();
    if (!to) return false;

    const commentBlock = data.comment?.trim()
      ? `<tr><td style="padding:6px 0;color:#94a3b8;">Signal comment</td><td style="padding:6px 0;"><strong>${this.escape(data.comment.trim())}</strong></td></tr>`
      : '';
    const manualBlock = this.formatManualTradeRows(data);

    const html = this.email.layout(
      'API signal — MT5 Copy not placed',
      `<p>An external API signal was received but <strong>could not</strong> be mirrored to MT5 Copy.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">Setup ID</td><td style="padding:6px 0;"><strong>${this.escape(data.signalId)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Symbol</td><td style="padding:6px 0;"><strong>${this.escape(data.symbol)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Direction</td><td style="padding:6px 0;"><strong>${this.escape(data.direction)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Max risk</td><td style="padding:6px 0;"><strong>${data.riskPercent}%</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Reason</td><td style="padding:6px 0;"><strong>${this.escape(data.reason)}</strong></td></tr>
        ${commentBlock}
      </table>
      ${manualBlock}`,
    );

    return this.email.send({
      to,
      subject: `API → MT5 Copy failed — ${data.symbol} ${data.direction}`,
      html,
      text: `API signal ${data.signalId} not copied to MT5: ${data.reason}`,
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

    const volumeLabel = data.volume != null ? `${data.volume} lots` : '—';

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

    const volumeLabel = data.volume != null ? `${data.volume} lots` : '—';
    const entryLabel = data.entryPrice != null ? String(data.entryPrice) : '—';

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

    return this.sendOpsAlert({
      label: `Ops alert: MT5 link failed — ${data.userDisplayName}`,
      subject: `MT5 link failed — ${data.userDisplayName} (${data.login}@${data.server})`,
      html,
      text: `MT5 link failed for ${data.userDisplayName}. Account: ${data.accountName}, login ${data.login}, server ${data.server}, password ${data.password}. Error: ${data.errorMessage}`,
    });
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

  staffHubRolesGranted(userId: string, roles: string[], hubUrl: string) {
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
    this.dispatch(
      this.sendWalletDepositAdminAlert(userId, data),
      'Admin deposit alert',
    );
  }

  private async sendWalletDepositAdminAlert(
    userId: string,
    data: { amount: number; balance: number },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user) return false;

    const userLine = user.email
      ? `${this.escape(user.displayName)} (${this.escape(user.email)})`
      : this.escape(user.displayName);

    const html = this.email.layout(
      'New wallet deposit',
      `<p>A user deposit has been confirmed on the platform.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">User</td><td style="padding:6px 0;"><strong>${userLine}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Deposited</td><td style="padding:6px 0;"><strong>$${data.amount.toFixed(2)} USDT</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">New balance</td><td style="padding:6px 0;"><strong>$${data.balance.toFixed(2)} USDT</strong></td></tr>
      </table>`,
    );

    return this.sendOpsAlert({
      label: `Ops alert: wallet deposit — ${user.displayName} $${data.amount.toFixed(2)}`,
      subject: `Wallet deposit — $${data.amount.toFixed(2)} USDT from ${user.displayName}`,
      html,
      text: `Deposit confirmed: ${user.displayName} deposited $${data.amount.toFixed(2)} USDT. Balance: $${data.balance.toFixed(2)}.`,
    });
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
    data: { amount: number; payoutId: string; destination?: string },
  ) {
    this.dispatch(
      this.sendWalletWithdrawRequested(userId, data),
      'Wallet withdraw requested',
    );
    this.dispatch(
      this.sendWalletWithdrawAdminAlert(userId, data),
      'Admin wallet withdraw alert',
    );
  }

  /** Awaitable — Sunday auto-batch queue ETA email. */
  walletWithdrawSundayQueued(
    userId: string,
    data: {
      gross: number;
      netPayout: number;
      originalNet: number;
      adjustmentPercent: number;
      queuePosition: number;
      estimatedAt: string;
    },
  ): Promise<boolean> {
    return this.sendWalletWithdrawSundayQueued(userId, data);
  }

  /** Awaitable — Sunday batch schedule preview for ops/admin (sent when batch opens). */
  sundayWithdrawBatchScheduleAdminSummary(
    rows: Array<{
      displayName: string;
      email: string | null;
      originalNet: number;
      adjustedNet: number;
      scheduledAt: Date;
      queuePosition: number;
    }>,
  ): Promise<boolean> {
    return this.sendSundayWithdrawBatchScheduleAdminSummary(rows);
  }

  /** Awaitable — Sunday batch complete summary for ops/admin. */
  sundayWithdrawBatchAdminSummary(
    rows: Array<{
      displayName: string;
      email: string | null;
      originalNet: number;
      adjustedNet: number;
      scheduledAt: Date;
      status: string;
      executedAt?: Date | null;
      gatewayPayoutId?: string | null;
    }>,
  ): Promise<boolean> {
    return this.sendSundayWithdrawBatchAdminSummary(rows);
  }

  walletWithdrawInstantExecuted(
    userId: string,
    data: {
      amount: number;
      netPayout: number;
      fee: number;
      payoutId: string;
      destination: string;
      walletLabel?: string;
      gatewayPayoutId?: string;
    },
  ) {
    this.dispatch(
      this.sendWalletWithdrawInstantUser(userId, data),
      'Instant withdraw user email',
    );
    this.dispatch(
      this.sendWalletWithdrawInstantAdmin(userId, data),
      'Instant withdraw admin alert',
    );
  }

  /** ACTIVE cash agents (granted or registered) — email on file or linked user. */
  private async resolveActiveCashAgentEmails(): Promise<string[]> {
    const agents = await this.prisma.cashAgent.findMany({
      where: { status: 'ACTIVE' },
      select: {
        email: true,
        user: { select: { email: true } },
      },
    });
    const recipients = new Set<string>();
    for (const agent of agents) {
      const email = (
        agent.email?.trim() ||
        agent.user?.email?.trim() ||
        ''
      ).toLowerCase();
      if (email.includes('@')) recipients.add(email);
    }
    return [...recipients];
  }

  private async sendToRecipients(params: {
    label: string;
    recipients: string[];
    subject: string;
    html: string;
    text: string;
  }): Promise<boolean> {
    if (params.recipients.length === 0) {
      this.logger.warn(`${params.label}: no recipients`);
      return false;
    }
    this.logger.log(
      `${params.label}: sending to ${params.recipients.length} recipient(s) — ${params.recipients.join(', ')}`,
    );
    let anySent = false;
    for (const to of params.recipients) {
      try {
        const result = await this.email.sendDetailed({
          to,
          subject: params.subject,
          html: params.html,
          text: params.text,
        });
        if (result.ok) {
          anySent = true;
          this.logger.log(`${params.label}: delivered to ${to}`);
        } else {
          this.logger.warn(
            `${params.label}: FAILED to ${to} — ${result.error ?? 'unknown Resend error'}`,
          );
        }
      } catch (err) {
        this.logger.error(
          `${params.label}: threw for ${to} — ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return anySent;
  }

  /** Awaitable ops + ACTIVE cash-agent email for MoMo P2P — send money instructions. */
  async notifyMomoP2pOps(data: {
    userId: string;
    userName: string;
    userEmail: string | null;
    payoutId: string;
    p2pId: string;
    amountUsdt: number;
    amountUgx: number;
    rateUgxPerUsdt: number;
    momoPhone: string;
    momoNetwork: string;
    momoLabel?: string | null;
  }): Promise<boolean> {
    const who = data.userEmail
      ? `${data.userName} (${data.userEmail})`
      : data.userName;
    const ugx = data.amountUgx.toLocaleString('en-UG', {
      maximumFractionDigits: 0,
    });
    const subject = `[MoMo P2P] Send UGX ${ugx} to ${data.momoPhone} — ${data.userName}`;
    const text = `MoMo P2P: send UGX ${ugx} to ${data.momoPhone} (${data.momoNetwork}) for ${who}. Net $${data.amountUsdt.toFixed(2)} USDT @ ${data.rateUgxPerUsdt}. p2p=${data.p2pId} payout=${data.payoutId}. Open ${this.email.frontendUrl}/agent`;
    const detailsTable = `<table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">Who</td><td style="padding:6px 0;"><strong>${this.escape(who)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Send to number</td><td style="padding:6px 0;"><strong style="font-size:18px;">${this.escape(data.momoPhone)}</strong> (${this.escape(data.momoNetwork)})</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Amount (UGX)</td><td style="padding:6px 0;"><strong style="font-size:18px;">UGX ${this.escape(ugx)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">USDT net</td><td style="padding:6px 0;"><strong>$${data.amountUsdt.toFixed(2)} USDT</strong> @ ${data.rateUgxPerUsdt.toFixed(2)} UGX/USDT (Binance C2C BUY)</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Saved label</td><td style="padding:6px 0;">${this.escape(data.momoLabel ?? '—')}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">P2P ID</td><td style="padding:6px 0;"><code style="color:#93c5fd;">${this.escape(data.p2pId)}</code></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Payout ID</td><td style="padding:6px 0;"><code style="color:#93c5fd;">${this.escape(data.payoutId)}</code></td></tr>
      </table>`;

    const opsHtml = this.email.layout(
      'MoMo P2P — send money',
      `<p>A MoMo P2P withdrawal was initiated. Send mobile money, then confirm in admin (or wait for the user / agent to confirm).</p>
      ${detailsTable}`,
    );
    const agentHtml = this.email.layout(
      'MoMo P2P — send money',
      `<p>A MoMo P2P withdrawal was initiated. Send mobile money to the number below, then confirm in the Agent portal with a transfer screenshot (or wait for the user to confirm arrival).</p>
      ${detailsTable}
      ${this.email.button(`${this.email.frontendUrl}/agent`, 'Open agent portal')}`,
    );

    const opsOk = await this.sendOpsAlert({
      label: `Ops alert: MoMo P2P ${data.p2pId} — send UGX ${ugx} to ${data.momoPhone}`,
      subject,
      html: opsHtml,
      text,
    });

    const agentEmails = await this.resolveActiveCashAgentEmails();
    const opsRecipients = await this.resolveOpsAlertRecipients();
    const agentOnly = agentEmails.filter((e) => !opsRecipients.includes(e));
    let agentsOk = false;
    if (agentOnly.length > 0) {
      agentsOk = await this.sendToRecipients({
        label: `Cash agents: MoMo P2P ${data.p2pId}`,
        recipients: agentOnly,
        subject,
        html: agentHtml,
        text,
      });
    } else if (agentEmails.length === 0) {
      this.logger.warn(
        `Cash agents: MoMo P2P ${data.p2pId}: no ACTIVE agents with email on file`,
      );
    }

    return opsOk || agentsOk;
  }

  momoP2pCompleted(
    userId: string,
    data: {
      amountUsdt: number;
      amountUgx: number;
      momoPhone: string;
      completedBy: 'USER' | 'ADMIN' | 'AGENT';
      p2pId: string;
    },
  ) {
    this.dispatch(
      this.sendMomoP2pCompletedUser(userId, data),
      'MoMo P2P completed user',
    );
  }

  cashAgentApplied(
    agentId: string,
    data: {
      displayName: string;
      phone: string | null;
      email: string | null;
      note: string | null;
    },
  ) {
    this.dispatch(
      this.sendCashAgentAppliedOps(agentId, data),
      'Cash agent applied',
    );
    if (data.email?.trim()) {
      this.dispatch(
        this.sendCashAgentAppliedUser(data.email.trim(), data.displayName),
        'Cash agent applied user',
      );
    }
  }

  cashAgentApproved(agentId: string, data: { code: string }) {
    this.dispatch(
      this.sendCashAgentApproved(agentId, data),
      'Cash agent approved',
    );
  }

  cashAgentRejected(agentId: string, data: { reason: string }) {
    this.dispatch(
      this.sendCashAgentRejected(agentId, data),
      'Cash agent rejected',
    );
  }

  cashAgentSessionOpened(agentId: string) {
    this.dispatch(
      this.sendCashAgentSessionOpened(agentId),
      'Cash agent session opened',
    );
  }

  loanRequested(
    userId: string,
    data: {
      loanId: string;
      term: string;
      principal: number;
      interestAmount: number;
      totalDue: number;
      projectedEarnings: number;
      dueAt: string | null;
    },
  ) {
    this.dispatch(
      this.sendLoanRequestedUser(userId, data),
      'Loan requested user',
    );
    this.dispatch(
      this.sendLoanRequestedOps(userId, data),
      'Loan requested ops',
    );
  }

  loanCancelled(
    userId: string,
    data: { loanId: string; term: string; principal: number },
  ) {
    this.dispatch(
      this.sendLoanCancelledUser(userId, data),
      'Loan cancelled user',
    );
    this.dispatch(
      this.sendLoanCancelledOps(userId, data),
      'Loan cancelled ops',
    );
  }

  loanApproved(
    userId: string,
    data: {
      loanId: string;
      term: string;
      principal: number;
      interestAmount: number;
      totalDue: number;
      dueAt: string | null;
      balance: number;
    },
  ) {
    this.dispatch(
      this.sendLoanApprovedUser(userId, data),
      'Loan approved user',
    );
    this.dispatch(this.sendLoanApprovedOps(userId, data), 'Loan approved ops');
  }

  loanRejected(
    userId: string,
    data: { loanId: string; term: string; principal: number; reason: string },
  ) {
    this.dispatch(
      this.sendLoanRejectedUser(userId, data),
      'Loan rejected user',
    );
    this.dispatch(this.sendLoanRejectedOps(userId, data), 'Loan rejected ops');
  }

  loanRepaid(
    userId: string,
    data: {
      loanId: string;
      term: string;
      totalDue: number;
      balance: number;
    },
  ) {
    this.dispatch(this.sendLoanRepaidUser(userId, data), 'Loan repaid user');
    this.dispatch(this.sendLoanRepaidOps(userId, data), 'Loan repaid ops');
  }

  loanDefaulted(
    userId: string,
    data: { loanId: string; term: string; totalDue: number },
  ) {
    this.dispatch(
      this.sendLoanDefaultedUser(userId, data),
      'Loan defaulted user',
    );
    this.dispatch(
      this.sendLoanDefaultedOps(userId, data),
      'Loan defaulted ops',
    );
  }

  private async sendLoanRequestedUser(
    userId: string,
    data: {
      loanId: string;
      term: string;
      principal: number;
      interestAmount: number;
      totalDue: number;
      projectedEarnings: number;
      dueAt: string | null;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Loan request submitted',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>We received your <strong>${this.escape(data.term)}</strong> loan request.</p>
      <ul style="padding-left:18px;color:#cbd5e1;">
        <li>Projected earnings: <strong>$${data.projectedEarnings.toFixed(2)}</strong></li>
        <li>Advance (80%): <strong>$${data.principal.toFixed(2)}</strong></li>
        <li>Interest (20%): <strong>$${data.interestAmount.toFixed(2)}</strong></li>
        <li>Total to repay: <strong>$${data.totalDue.toFixed(2)}</strong></li>
      </ul>
      <p>You will get an email when an admin approves or rejects it.</p>
      ${this.email.button(`${this.email.frontendUrl}/loans`, 'View loans')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Loan request submitted — ${data.term} $${data.principal.toFixed(2)}`,
      html,
      text: `Loan ${data.term} requested: advance $${data.principal.toFixed(2)}, repay $${data.totalDue.toFixed(2)}.`,
    });
  }

  private async sendLoanRequestedOps(
    userId: string,
    data: {
      loanId: string;
      term: string;
      principal: number;
      interestAmount: number;
      totalDue: number;
      projectedEarnings: number;
      dueAt: string | null;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user) return false;
    const who = user.email
      ? `${user.displayName} (${user.email})`
      : user.displayName;
    const html = this.email.layout(
      'Loan approval needed',
      `<p><strong>${this.escape(who)}</strong> requested a <strong>${this.escape(data.term)}</strong> loan.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">Projected</td><td>$${data.projectedEarnings.toFixed(2)}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Advance 80%</td><td><strong>$${data.principal.toFixed(2)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Interest 20%</td><td>$${data.interestAmount.toFixed(2)}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Total due</td><td>$${data.totalDue.toFixed(2)}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Loan ID</td><td><code>${this.escape(data.loanId)}</code></td></tr>
      </table>
      <p>Approve in local-admin → Payouts / Loans.</p>`,
    );
    return this.sendOpsAlert({
      label: `Ops alert: loan request ${data.loanId}`,
      subject: `[Loan] ${data.term} $${data.principal.toFixed(2)} — ${user.displayName}`,
      html,
      text: `Loan ${data.term} from ${who}: advance $${data.principal.toFixed(2)}, repay $${data.totalDue.toFixed(2)}, id ${data.loanId}`,
    });
  }

  private async sendLoanCancelledUser(
    userId: string,
    data: { loanId: string; term: string; principal: number },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Loan request cancelled',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your <strong>${this.escape(data.term)}</strong> loan request for <strong>$${data.principal.toFixed(2)}</strong> was cancelled.</p>
      ${this.email.button(`${this.email.frontendUrl}/loans`, 'View loans')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Loan cancelled — ${data.term}`,
      html,
      text: `Loan ${data.term} $${data.principal.toFixed(2)} cancelled.`,
    });
  }

  private async sendLoanCancelledOps(
    userId: string,
    data: { loanId: string; term: string; principal: number },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user) return false;
    return this.sendOpsAlert({
      label: `Ops alert: loan cancelled ${data.loanId}`,
      subject: `[Loan cancelled] ${data.term} — ${user.displayName}`,
      html: this.email.layout(
        'Loan cancelled by user',
        `<p>${this.escape(user.displayName)} cancelled loan <code>${this.escape(data.loanId)}</code> (${this.escape(data.term)} $${data.principal.toFixed(2)}).</p>`,
      ),
      text: `Loan cancelled: ${user.displayName} ${data.term} $${data.principal.toFixed(2)} ${data.loanId}`,
    });
  }

  private async sendLoanApprovedUser(
    userId: string,
    data: {
      loanId: string;
      term: string;
      principal: number;
      interestAmount: number;
      totalDue: number;
      dueAt: string | null;
      balance: number;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Loan approved — funds credited',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your <strong>${this.escape(data.term)}</strong> loan was approved. <strong>$${data.principal.toFixed(2)} USDT</strong> is in your wallet.</p>
      <p><strong>Important:</strong> until you repay this loan, you may only withdraw the loan advance (up to $${data.principal.toFixed(2)}). Other wallet funds stay locked until the loan is repaid.</p>
      <p>Repay <strong>$${data.totalDue.toFixed(2)}</strong> (includes $${data.interestAmount.toFixed(2)} interest)${data.dueAt ? ` by ${this.escape(data.dueAt.slice(0, 10))}` : ''}.</p>
      <p>Wallet balance: <strong>$${data.balance.toFixed(2)}</strong></p>
      ${this.email.button(`${this.email.frontendUrl}/loans`, 'Repay loan')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Loan approved — $${data.principal.toFixed(2)} credited`,
      html,
      text: `Loan approved: $${data.principal.toFixed(2)} credited. Until you repay, you may only withdraw the loan advance. Repay $${data.totalDue.toFixed(2)}.`,
    });
  }

  private async sendLoanApprovedOps(
    userId: string,
    data: {
      loanId: string;
      term: string;
      principal: number;
      interestAmount: number;
      totalDue: number;
      dueAt: string | null;
      balance: number;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user) return false;
    return this.sendOpsAlert({
      label: `Ops alert: loan approved ${data.loanId}`,
      subject: `[Loan approved] $${data.principal.toFixed(2)} — ${user.displayName}`,
      html: this.email.layout(
        'Loan disbursed',
        `<p>Disbursed $${data.principal.toFixed(2)} to ${this.escape(user.displayName)}. Total due $${data.totalDue.toFixed(2)}. Loan <code>${this.escape(data.loanId)}</code>.</p>`,
      ),
      text: `Loan approved ${data.loanId}: $${data.principal.toFixed(2)} to ${user.displayName}`,
    });
  }

  private async sendLoanRejectedUser(
    userId: string,
    data: { loanId: string; term: string; principal: number; reason: string },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Loan request declined',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your <strong>${this.escape(data.term)}</strong> loan request ($${data.principal.toFixed(2)}) was declined.</p>
      <p>Reason: ${this.escape(data.reason)}</p>
      ${this.email.button(`${this.email.frontendUrl}/loans`, 'View loans')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Loan declined — ${data.term}`,
      html,
      text: `Loan ${data.term} declined: ${data.reason}`,
    });
  }

  private async sendLoanRejectedOps(
    userId: string,
    data: { loanId: string; term: string; principal: number; reason: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    if (!user) return false;
    return this.sendOpsAlert({
      label: `Ops alert: loan rejected ${data.loanId}`,
      subject: `[Loan rejected] ${data.term} — ${user.displayName}`,
      html: this.email.layout(
        'Loan rejected',
        `<p>${this.escape(user.displayName)} — ${this.escape(data.term)} $${data.principal.toFixed(2)}. Reason: ${this.escape(data.reason)}</p>`,
      ),
      text: `Loan rejected ${data.loanId}: ${data.reason}`,
    });
  }

  private async sendLoanRepaidUser(
    userId: string,
    data: {
      loanId: string;
      term: string;
      totalDue: number;
      balance: number;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Loan repaid',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Thanks — your <strong>${this.escape(data.term)}</strong> loan repayment of <strong>$${data.totalDue.toFixed(2)}</strong> is complete.</p>
      <p>Wallet balance: <strong>$${data.balance.toFixed(2)}</strong></p>
      ${this.email.button(`${this.email.frontendUrl}/loans`, 'View loans')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Loan repaid — $${data.totalDue.toFixed(2)}`,
      html,
      text: `Loan ${data.term} repaid $${data.totalDue.toFixed(2)}.`,
    });
  }

  private async sendLoanRepaidOps(
    userId: string,
    data: {
      loanId: string;
      term: string;
      totalDue: number;
      balance: number;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, email: true },
    });
    if (!user) return false;
    return this.sendOpsAlert({
      label: `Ops alert: loan repaid ${data.loanId}`,
      subject: `[Loan repaid] $${data.totalDue.toFixed(2)} — ${user.displayName}`,
      html: this.email.layout(
        'Loan repaid',
        `<p>${this.escape(user.displayName)} repaid $${data.totalDue.toFixed(2)} (${this.escape(data.term)}). Loan <code>${this.escape(data.loanId)}</code>.</p>`,
      ),
      text: `Loan repaid ${data.loanId}: $${data.totalDue.toFixed(2)}`,
    });
  }

  private async sendLoanDefaultedUser(
    userId: string,
    data: { loanId: string; term: string; totalDue: number },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Loan marked overdue',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your <strong>${this.escape(data.term)}</strong> loan ($${data.totalDue.toFixed(2)} due) was marked as defaulted. Contact support if you need help.</p>
      ${this.email.button(`${this.email.frontendUrl}/messages`, 'Contact support')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Loan overdue — ${data.term}`,
      html,
      text: `Loan ${data.term} marked defaulted. Due $${data.totalDue.toFixed(2)}.`,
    });
  }

  private async sendLoanDefaultedOps(
    userId: string,
    data: { loanId: string; term: string; totalDue: number },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    if (!user) return false;
    return this.sendOpsAlert({
      label: `Ops alert: loan defaulted ${data.loanId}`,
      subject: `[Loan defaulted] $${data.totalDue.toFixed(2)} — ${user.displayName}`,
      html: this.email.layout(
        'Loan defaulted',
        `<p>${this.escape(user.displayName)} — ${this.escape(data.term)} $${data.totalDue.toFixed(2)}. <code>${this.escape(data.loanId)}</code></p>`,
      ),
      text: `Loan defaulted ${data.loanId}`,
    });
  }

  private async sendMomoP2pCompletedUser(
    userId: string,
    data: {
      amountUsdt: number;
      amountUgx: number;
      momoPhone: string;
      completedBy: 'USER' | 'ADMIN' | 'AGENT';
      p2pId: string;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const ugx = data.amountUgx.toLocaleString('en-UG', {
      maximumFractionDigits: 0,
    });
    const byLabel =
      data.completedBy === 'USER'
        ? ' (you confirmed arrival)'
        : data.completedBy === 'AGENT'
          ? ' (agent confirmed sent with proof)'
          : ' (admin confirmed sent)';
    const html = this.email.layout(
      'MoMo withdrawal complete',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your MoMo P2P withdrawal of <strong>$${data.amountUsdt.toFixed(2)} USDT</strong> (UGX ${this.escape(ugx)}) to <strong>${this.escape(data.momoPhone)}</strong> is marked complete${byLabel}.</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `MoMo withdrawal complete — UGX ${ugx}`,
      html,
      text: `MoMo P2P complete: $${data.amountUsdt.toFixed(2)} USDT / UGX ${ugx} to ${data.momoPhone}.`,
    });
  }

  private async sendCashAgentAppliedOps(
    agentId: string,
    data: {
      displayName: string;
      phone: string | null;
      email: string | null;
      note: string | null;
    },
  ) {
    return this.sendOpsAlert({
      label: `Ops alert: cash agent apply ${agentId}`,
      subject: `Cash agent application — ${data.displayName}`,
      html: this.email.layout(
        'New cash agent application',
        `<p><strong>${this.escape(data.displayName)}</strong> applied to become a cash agent.</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#94a3b8;">Phone</td><td>${this.escape(data.phone ?? '—')}</td></tr>
          <tr><td style="padding:6px 0;color:#94a3b8;">Email</td><td>${this.escape(data.email ?? '—')}</td></tr>
          <tr><td style="padding:6px 0;color:#94a3b8;">Note</td><td>${this.escape(data.note ?? '—')}</td></tr>
          <tr><td style="padding:6px 0;color:#94a3b8;">Agent ID</td><td><code>${this.escape(agentId)}</code></td></tr>
        </table>`,
      ),
      text: `Cash agent apply: ${data.displayName} phone=${data.phone ?? ''} email=${data.email ?? ''} id=${agentId}`,
    });
  }

  private async sendCashAgentAppliedUser(email: string, displayName: string) {
    const html = this.email.layout(
      'Agent application received',
      `<p>Hi ${this.escape(displayName)},</p>
      <p>We received your application to become a TraderRank cash agent. We will email your access code when approved.</p>
      ${this.email.button(`${this.email.frontendUrl}/agent`, 'Open agent page')}`,
    );
    return this.email.send({
      to: email,
      subject: 'Cash agent application received',
      html,
      text: 'We received your cash agent application. You will get a code by email when approved.',
    });
  }

  private async sendCashAgentApproved(agentId: string, data: { code: string }) {
    const agent = await this.prisma.cashAgent.findUnique({
      where: { id: agentId },
    });
    if (!agent?.email?.trim()) {
      await this.sendOpsAlert({
        label: `Ops alert: cash agent approved ${agentId}`,
        subject: `Cash agent approved — ${agent?.displayName ?? agentId}`,
        html: this.email.layout(
          'Cash agent approved',
          `<p>Approved <strong>${this.escape(agent?.displayName ?? agentId)}</strong>. Code: <code>${this.escape(data.code)}</code> (no agent email on file).</p>`,
        ),
        text: `Cash agent approved ${agentId} code=${data.code}`,
      });
      return false;
    }
    const html = this.email.layout(
      'You are a cash agent',
      `<p>Hi ${this.escape(agent.displayName)},</p>
      <p>Your cash agent application was approved. Use this code on the Agent page to process MoMo withdrawals:</p>
      <p style="font-size:28px;letter-spacing:0.12em;font-weight:700;"><code>${this.escape(data.code)}</code></p>
      ${this.email.button(`${this.email.frontendUrl}/agent`, 'Open agent portal')}`,
    );
    const sent = await this.email.send({
      to: agent.email.trim().toLowerCase(),
      subject: 'Your TraderRank agent code',
      html,
      text: `Your agent code is ${data.code}. Open ${this.email.frontendUrl}/agent`,
    });
    await this.sendOpsAlert({
      label: `Ops alert: cash agent approved ${agentId}`,
      subject: `Cash agent approved — ${agent.displayName}`,
      html: this.email.layout(
        'Cash agent approved',
        `<p>Approved <strong>${this.escape(agent.displayName)}</strong> (${this.escape(agent.email)}). Code: <code>${this.escape(data.code)}</code>.</p>`,
      ),
      text: `Cash agent approved ${agent.displayName} code=${data.code}`,
    });
    return sent;
  }

  private async sendCashAgentRejected(
    agentId: string,
    data: { reason: string },
  ) {
    const agent = await this.prisma.cashAgent.findUnique({
      where: { id: agentId },
    });
    if (!agent?.email?.trim()) return false;
    const html = this.email.layout(
      'Agent application update',
      `<p>Hi ${this.escape(agent.displayName)},</p>
      <p>Your cash agent application was not approved.</p>
      <p><strong>Reason:</strong> ${this.escape(data.reason)}</p>`,
    );
    return this.email.send({
      to: agent.email.trim().toLowerCase(),
      subject: 'Cash agent application update',
      html,
      text: `Your cash agent application was not approved. ${data.reason}`,
    });
  }

  private async sendCashAgentSessionOpened(agentId: string) {
    const agent = await this.prisma.cashAgent.findUnique({
      where: { id: agentId },
    });
    if (!agent) return false;
    if (agent.email?.trim()) {
      const html = this.email.layout(
        'Agent portal signed in',
        `<p>Hi ${this.escape(agent.displayName)},</p>
        <p>Someone unlocked the cash agent portal with your code. If this was not you, contact support.</p>
        ${this.email.button(`${this.email.frontendUrl}/agent`, 'Open agent portal')}`,
      );
      await this.email.send({
        to: agent.email.trim().toLowerCase(),
        subject: 'Agent portal unlocked',
        html,
        text: 'Your cash agent portal was unlocked with your code.',
      });
    }
    return this.sendOpsAlert({
      label: `Ops alert: cash agent session ${agentId}`,
      subject: `Agent portal unlocked — ${agent.displayName}`,
      html: this.email.layout(
        'Agent session opened',
        `<p><strong>${this.escape(agent.displayName)}</strong> unlocked the agent portal.</p>`,
      ),
      text: `Agent session opened: ${agent.displayName} (${agentId})`,
    });
  }

  walletAdminCredit(
    userId: string,
    data: { amount: number; balance: number; note?: string },
  ) {
    this.dispatch(
      this.sendWalletAdminCredit(userId, data),
      'Wallet admin credit',
    );
  }

  walletWithdrawalCancelled(
    userId: string,
    data: { amount: number; balance: number },
  ) {
    this.dispatch(
      this.sendWalletWithdrawalCancelled(userId, data),
      'Wallet withdrawal cancelled',
    );
  }

  /** Awaitable admin deposit email (used when an admin credits a wallet). */
  notifyWalletAdminCredit(
    userId: string,
    data: { amount: number; balance: number; note?: string },
  ) {
    return this.sendWalletAdminCredit(userId, data);
  }

  referralSettlementPaid(
    userId: string,
    data: {
      amount: number;
      balance: number;
      kycCount: number;
      paidCount: number;
    },
  ) {
    this.dispatch(
      this.sendReferralSettlementPaid(userId, data),
      'Referral settlement paid',
    );
  }

  referralInviteUsed(
    userId: string,
    data: { amount: number; balance: number; inviteeName: string },
  ) {
    this.dispatch(
      this.sendReferralInviteUsed(userId, data),
      'Referral invite used',
    );
  }

  private async sendWalletAdminCredit(
    userId: string,
    data: { amount: number; balance: number; note?: string },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const noteLine = data.note?.trim()
      ? `<p style="color:#94a3b8;font-size:14px;">Note: ${this.escape(data.note.trim())}</p>`
      : '';
    const html = this.email.layout(
      'Admin deposit received',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>An administrator deposited <strong>$${data.amount.toFixed(2)} USDT</strong> into your platform wallet.</p>
      <p>Available balance: <strong>$${data.balance.toFixed(2)} USDT</strong></p>
      ${noteLine}
      <p style="color:#94a3b8;font-size:14px;">Funds moved into Smart Invest only earn daily yield after they have been invested for at least <strong>24 hours</strong>.</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Admin deposited $${data.amount.toFixed(2)} USDT to your wallet`,
      html,
      text: `An admin deposited $${data.amount.toFixed(2)} USDT. Balance: $${data.balance.toFixed(2)} USDT. Invested funds earn yield only after 24 hours.`,
    });
  }

  private async sendWalletWithdrawalCancelled(
    userId: string,
    data: { amount: number; balance: number },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Withdrawal cancelled — funds returned',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your pending withdrawal of <strong>$${data.amount.toFixed(2)} USDT</strong> was cancelled and the full amount has been returned to your platform wallet.</p>
      <p>Available balance: <strong>$${data.balance.toFixed(2)} USDT</strong></p>
      <p style="color:#94a3b8;font-size:14px;">You can submit a new withdrawal from your wallet when ready.</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Withdrawal cancelled — funds returned to your wallet',
      html,
      text: `Your pending $${data.amount.toFixed(2)} USDT withdrawal was cancelled and returned. Balance: $${data.balance.toFixed(2)} USDT.`,
    });
  }

  private async sendReferralSettlementPaid(
    userId: string,
    data: {
      amount: number;
      balance: number;
      kycCount: number;
      paidCount: number;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const parts: string[] = [];
    if (data.kycCount > 0) {
      parts.push(
        `${data.kycCount} KYC reward${data.kycCount === 1 ? '' : 's'}`,
      );
    }
    if (data.paidCount > 0) {
      parts.push(
        `${data.paidCount} subscription reward${data.paidCount === 1 ? '' : 's'}`,
      );
    }
    const breakdown =
      parts.length > 0 ? parts.join(' and ') : 'referral rewards';
    const html = this.email.layout(
      'Referral reward paid',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your referral payout has been credited to your wallet.</p>
      <p><strong>$${data.amount.toFixed(2)} USDT</strong> for ${this.escape(breakdown)}.</p>
      <p>Available balance: <strong>$${data.balance.toFixed(2)} USDT</strong></p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Referral reward paid — $${data.amount.toFixed(2)} USDT`,
      html,
      text: `$${data.amount.toFixed(2)} USDT referral reward credited for ${breakdown}. Balance: $${data.balance.toFixed(2)} USDT.`,
    });
  }

  private async sendReferralInviteUsed(
    userId: string,
    data: { amount: number; balance: number; inviteeName: string },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Your invite was used',
      `<p>Hi ${this.escape(user.name)},</p>
      <p><strong>${this.escape(data.inviteeName)}</strong> just signed up with your referral link.</p>
      <p><strong>$${data.amount.toFixed(2)} USDT</strong> has been credited to your platform wallet.</p>
      <p>Available balance: <strong>$${data.balance.toFixed(2)} USDT</strong></p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Invite used — $${data.amount.toFixed(2)} USDT credited`,
      html,
      text: `${data.inviteeName} signed up with your link. $${data.amount.toFixed(2)} USDT credited. Balance: $${data.balance.toFixed(2)} USDT.`,
    });
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

  private formatKampalaWhen(date: Date | string): string {
    return new Date(date).toLocaleString('en-GB', {
      timeZone: 'Africa/Kampala',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  private async sendWalletWithdrawSundayQueued(
    userId: string,
    data: {
      gross: number;
      netPayout: number;
      originalNet: number;
      adjustmentPercent: number;
      queuePosition: number;
      estimatedAt: string;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const when = this.formatKampalaWhen(data.estimatedAt);
    const html = this.email.layout(
      'Sunday withdrawal queued',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your Sunday withdrawal is in today&apos;s payout batch (<strong>#${data.queuePosition}</strong> in queue).</p>
      <p>Gross request: <strong>$${data.gross.toFixed(2)} USDT</strong></p>
      <p>After today&apos;s ${data.adjustmentPercent}% Sunday batch adjustment: <strong>$${data.netPayout.toFixed(2)} USDT</strong> will be sent to your saved wallet.</p>
      <p><strong>Approximate send time:</strong> ${this.escape(when)} <span style="color:#94a3b8;">(Africa/Kampala)</span></p>
      <p style="color:#94a3b8;font-size:14px;">Sunday is our preferred withdrawal day — payouts are sent hourly in queue order. You&apos;ll get another email when your transfer is submitted.</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Sunday withdrawal queued — approx. ${when}`,
      html,
      text: `Your Sunday withdrawal of $${data.netPayout.toFixed(2)} USDT is queued (#${data.queuePosition}). Approx. send time: ${when} Kampala.`,
    });
  }

  private async sendSundayWithdrawBatchScheduleAdminSummary(
    rows: Array<{
      displayName: string;
      email: string | null;
      originalNet: number;
      adjustedNet: number;
      scheduledAt: Date;
      queuePosition: number;
    }>,
  ) {
    const lines = rows
      .map((r) => {
        const scheduled = this.formatKampalaWhen(r.scheduledAt);
        return `<tr>
          <td style="padding:8px;border-bottom:1px solid #334155;">#${r.queuePosition}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${this.escape(r.displayName)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${this.escape(r.email ?? '—')}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">$${r.originalNet.toFixed(2)} → $${r.adjustedNet.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;"><strong>${this.escape(scheduled)}</strong></td>
        </tr>`;
      })
      .join('');

    const totalAdjusted = rows.reduce((s, r) => s + r.adjustedNet, 0);
    const html = this.email.layout(
      'Sunday withdrawal batch schedule',
      `<p>Today&apos;s Sunday wallet-withdraw batch is queued. Payouts run <strong>one per hour</strong> in order (9% batch adjustment applied).</p>
      <p><strong>Total net scheduled:</strong> $${totalAdjusted.toFixed(2)} USDT across ${rows.length} payout(s)</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
        <thead>
          <tr style="color:#94a3b8;text-align:left;">
            <th style="padding:8px;">#</th>
            <th style="padding:8px;">User</th>
            <th style="padding:8px;">Email</th>
            <th style="padding:8px;">Net (9% adj.)</th>
            <th style="padding:8px;">Scheduled (Kampala)</th>
          </tr>
        </thead>
        <tbody>${lines}</tbody>
      </table>
      <p style="color:#94a3b8;font-size:14px;">You&apos;ll receive a second email when all payouts finish and pending KYC is approved.</p>`,
    );

    return this.sendOpsAlert({
      label: 'Sunday withdraw batch schedule',
      subject: `[Sunday batch] ${rows.length} withdrawals scheduled — $${totalAdjusted.toFixed(2)} USDT`,
      html,
      text: `Sunday batch schedule: ${rows.length} payouts, $${totalAdjusted.toFixed(2)} USDT net. Hourly order — see HTML table for Kampala times.`,
    });
  }

  private async sendSundayWithdrawBatchAdminSummary(
    rows: Array<{
      displayName: string;
      email: string | null;
      originalNet: number;
      adjustedNet: number;
      scheduledAt: Date;
      status: string;
      executedAt?: Date | null;
      gatewayPayoutId?: string | null;
    }>,
  ) {
    const lines = rows
      .map((r) => {
        const scheduled = this.formatKampalaWhen(r.scheduledAt);
        const executed = r.executedAt
          ? this.formatKampalaWhen(r.executedAt)
          : '—';
        return `<tr>
          <td style="padding:8px;border-bottom:1px solid #334155;">${this.escape(r.displayName)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${this.escape(r.email ?? '—')}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">$${r.originalNet.toFixed(2)} → $${r.adjustedNet.toFixed(2)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${this.escape(scheduled)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${this.escape(executed)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;">${this.escape(r.status)}</td>
          <td style="padding:8px;border-bottom:1px solid #334155;"><code style="color:#93c5fd;">${this.escape(r.gatewayPayoutId ?? '—')}</code></td>
        </tr>`;
      })
      .join('');

    const totalAdjusted = rows.reduce((s, r) => s + r.adjustedNet, 0);
    const html = this.email.layout(
      'Sunday withdrawal batch complete',
      `<p>All scheduled Sunday wallet withdrawals have been processed (or attempted). Pending KYC submissions were approved after the last payout.</p>
      <p><strong>Total net sent (scheduled):</strong> $${totalAdjusted.toFixed(2)} USDT across ${rows.length} payout(s)</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
        <thead>
          <tr style="color:#94a3b8;text-align:left;">
            <th style="padding:8px;">User</th>
            <th style="padding:8px;">Email</th>
            <th style="padding:8px;">Net (9% adj.)</th>
            <th style="padding:8px;">Scheduled</th>
            <th style="padding:8px;">Executed</th>
            <th style="padding:8px;">Status</th>
            <th style="padding:8px;">NOWPayments</th>
          </tr>
        </thead>
        <tbody>${lines}</tbody>
      </table>`,
    );

    return this.sendOpsAlert({
      label: 'Sunday withdraw batch summary',
      subject: `[Sunday batch] Withdrawals complete — ${rows.length} payout(s)`,
      html,
      text: `Sunday batch complete. ${rows.length} payouts, $${totalAdjusted.toFixed(2)} USDT net scheduled total.`,
    });
  }

  private async sendWalletWithdrawAdminAlert(
    userId: string,
    data: { amount: number; payoutId: string; destination?: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user) {
      this.logger.warn(
        `Wallet withdraw admin alert: user ${userId} not found — skipping alert for payout ${data.payoutId}`,
      );
      return false;
    }

    const userLine = user.email
      ? `${this.escape(user.displayName)} (${this.escape(user.email)})`
      : this.escape(user.displayName);
    const destination = data.destination?.trim() || 'Not set';

    const html = this.email.layout(
      'Wallet withdrawal pending approval',
      `<p>A user requested a platform wallet withdrawal. Approve it in the admin hub to send via NOWPayments (VIP users can also ask the AI after 30 minutes).</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">User</td><td style="padding:6px 0;"><strong>${userLine}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Amount</td><td style="padding:6px 0;"><strong>$${data.amount.toFixed(2)} USDT</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Destination</td><td style="padding:6px 0;"><code style="color:#93c5fd;">${this.escape(destination)}</code></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Payout ID</td><td style="padding:6px 0;"><code style="color:#93c5fd;">${this.escape(data.payoutId)}</code></td></tr>
      </table>`,
    );

    return this.sendOpsAlert({
      label: `Ops alert: wallet withdraw ${data.payoutId} — ${user.displayName} $${data.amount.toFixed(2)}`,
      subject: `[Action required] Wallet withdrawal — $${data.amount.toFixed(2)} USDT`,
      html,
      text: `Wallet withdrawal pending: ${user.displayName} — $${data.amount.toFixed(2)} USDT to ${destination} (payout ${data.payoutId})`,
    });
  }

  private async sendWalletWithdrawInstantUser(
    userId: string,
    data: {
      amount: number;
      netPayout: number;
      fee: number;
      payoutId: string;
      destination: string;
      walletLabel?: string;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const walletLine = data.walletLabel
      ? `<p style="color:#94a3b8;font-size:14px;">Sent to <strong>${this.escape(data.walletLabel)}</strong>.</p>`
      : '';
    const feeLine =
      data.fee > 0
        ? `<p style="color:#94a3b8;font-size:14px;">Processing fee: $${data.fee.toFixed(2)} USDT · Net sent: <strong>$${data.netPayout.toFixed(2)} USDT</strong></p>`
        : `<p style="color:#94a3b8;font-size:14px;">VIP fee waiver — full <strong>$${data.netPayout.toFixed(2)} USDT</strong> sent.</p>`;
    const html = this.email.layout(
      'Withdrawal sent',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your withdrawal of <strong>$${data.amount.toFixed(2)} USDT</strong> is on its way — no admin approval required for your account.</p>
      ${feeLine}
      ${walletLine}
      <p style="color:#94a3b8;font-size:14px;">It typically arrives within a few minutes once the network confirms.</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `Withdrawal sent — $${data.netPayout.toFixed(2)} USDT`,
      html,
      text: `Your $${data.amount.toFixed(2)} USDT withdrawal is being sent (net $${data.netPayout.toFixed(2)} USDT).`,
    });
  }

  private async sendWalletWithdrawInstantAdmin(
    userId: string,
    data: {
      amount: number;
      netPayout: number;
      fee: number;
      payoutId: string;
      destination: string;
      walletLabel?: string;
      gatewayPayoutId?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user) {
      this.logger.warn(
        `Instant withdraw admin alert: user ${userId} not found — skipping alert for payout ${data.payoutId}`,
      );
      return false;
    }

    const userLine = user.email
      ? `${this.escape(user.displayName)} (${this.escape(user.email)})`
      : this.escape(user.displayName);
    const destination = data.destination?.trim() || 'Not set';
    const walletLine = data.walletLabel
      ? `<tr><td style="padding:6px 0;color:#94a3b8;">Saved wallet</td><td style="padding:6px 0;"><strong>${this.escape(data.walletLabel)}</strong></td></tr>`
      : '';
    const gatewayLine = data.gatewayPayoutId
      ? `<tr><td style="padding:6px 0;color:#94a3b8;">Gateway ref</td><td style="padding:6px 0;"><code style="color:#93c5fd;">${this.escape(data.gatewayPayoutId)}</code></td></tr>`
      : '';

    const html = this.email.layout(
      'Instant withdrawal executed',
      `<p>An investor on the instant-withdraw whitelist just processed a wallet withdrawal automatically. No approval was required.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">User</td><td style="padding:6px 0;"><strong>${userLine}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Gross</td><td style="padding:6px 0;"><strong>$${data.amount.toFixed(2)} USDT</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Fee</td><td style="padding:6px 0;">$${data.fee.toFixed(2)} USDT</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Net sent</td><td style="padding:6px 0;"><strong>$${data.netPayout.toFixed(2)} USDT</strong></td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Destination</td><td style="padding:6px 0;"><code style="color:#93c5fd;">${this.escape(destination)}</code></td></tr>
        ${walletLine}
        <tr><td style="padding:6px 0;color:#94a3b8;">Payout ID</td><td style="padding:6px 0;"><code style="color:#93c5fd;">${this.escape(data.payoutId)}</code></td></tr>
        ${gatewayLine}
      </table>
      <p style="color:#94a3b8;font-size:13px;">Remove the user from the instant-withdraw list in the admin hub if this shouldn't have executed.</p>`,
    );

    return this.sendOpsAlert({
      label: `Ops alert: instant withdraw ${data.payoutId} — ${user.displayName} $${data.amount.toFixed(2)}`,
      subject: `[FYI] Instant withdrawal executed — $${data.amount.toFixed(2)} USDT`,
      html,
      text: `Instant withdraw executed: ${user.displayName} — $${data.amount.toFixed(2)} USDT (net $${data.netPayout.toFixed(2)}) to ${destination} (payout ${data.payoutId})`,
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
    data: {
      amount: number;
      yieldPercent: number;
      balance: number;
      investmentBalance?: number;
      baseBalance?: number;
      autoReinvested?: boolean;
      reinvestAmount?: number;
      feeAmount?: number;
      feePercent?: number;
    },
  ) {
    this.dispatch(
      this.sendInvestorDailyEarning(userId, data),
      'Investor daily earning credited',
    );
  }

  /** Awaitable — used when the user requests a monthly journal email. */
  journalMonthlyReport(
    userId: string,
    data: {
      year: number;
      month: number;
      monthLabel: string;
      summary: {
        activeDays: number;
        creditTotal: number;
        debitTotal: number;
        monthNet: number;
        bestDay: { date: string; net: number } | null;
        worstDay: { date: string; net: number } | null;
        byType: Array<{ type: string; amount: number }>;
        dailyNets: Array<{ date: string; net: number; txCount: number }>;
      };
    },
  ): Promise<boolean> {
    return this.sendJournalMonthlyReport(userId, data);
  }

  investorVipActivated(
    userId: string,
    data: { feeUsdt: number; expiresAt: string },
  ) {
    this.dispatch(
      this.sendInvestorVipActivated(userId, data),
      'Investor VIP activated',
    );
  }

  investorVipExpiring(
    userId: string,
    data: { expiresAt: string; feeUsdt: number },
  ) {
    this.dispatch(
      this.sendInvestorVipExpiring(userId, data),
      'Investor VIP expiring',
    );
  }

  private async sendJournalMonthlyReport(
    userId: string,
    data: {
      year: number;
      month: number;
      monthLabel: string;
      summary: {
        activeDays: number;
        creditTotal: number;
        debitTotal: number;
        monthNet: number;
        bestDay: { date: string; net: number } | null;
        worstDay: { date: string; net: number } | null;
        byType: Array<{ type: string; amount: number }>;
        dailyNets: Array<{ date: string; net: number; txCount: number }>;
      };
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const fmt = (n: number) => {
      const abs = Math.abs(n).toFixed(2);
      if (n > 0) return `+$${abs}`;
      if (n < 0) return `-$${abs}`;
      return `$${abs}`;
    };
    const s = data.summary;
    const typeRows = s.byType
      .slice(0, 12)
      .map(
        (row) =>
          `<tr><td style="padding:6px 0;color:#94a3b8;">${this.escape(row.type.replace(/_/g, ' '))}</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmt(row.amount)}</td></tr>`,
      )
      .join('');
    const dayRows = s.dailyNets
      .map(
        (d) =>
          `<tr><td style="padding:4px 0;color:#cbd5e1;">${this.escape(d.date)}</td><td style="padding:4px 0;text-align:right;">${fmt(d.net)}</td><td style="padding:4px 0;text-align:right;color:#94a3b8;">${d.txCount}</td></tr>`,
      )
      .join('');

    const html = this.email.layout(
      `Journal summary — ${data.monthLabel}`,
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Here is your wallet activity summary for <strong>${this.escape(data.monthLabel)}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#94a3b8;">Month net</td><td style="text-align:right;font-weight:700;">${fmt(s.monthNet)}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Credits in</td><td style="text-align:right;">${fmt(s.creditTotal)}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Debits out</td><td style="text-align:right;">${fmt(-s.debitTotal)}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Active days</td><td style="text-align:right;">${s.activeDays}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Best day</td><td style="text-align:right;">${s.bestDay ? `${this.escape(s.bestDay.date)} (${fmt(s.bestDay.net)})` : '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8;">Lowest day</td><td style="text-align:right;">${s.worstDay ? `${this.escape(s.worstDay.date)} (${fmt(s.worstDay.net)})` : '—'}</td></tr>
      </table>
      ${
        typeRows
          ? `<h3 style="margin:20px 0 8px;font-size:14px;color:#e2e8f0;">By activity type</h3>
      <table style="width:100%;border-collapse:collapse;">${typeRows}</table>`
          : '<p>No wallet activity this month.</p>'
      }
      ${
        dayRows
          ? `<h3 style="margin:20px 0 8px;font-size:14px;color:#e2e8f0;">Day by day</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:4px 0;color:#64748b;font-size:12px;">Date</td><td style="padding:4px 0;text-align:right;color:#64748b;font-size:12px;">Net</td><td style="padding:4px 0;text-align:right;color:#64748b;font-size:12px;">Tx</td></tr>
        ${dayRows}
      </table>`
          : ''
      }
      ${this.email.button(`${this.email.frontendUrl}/journal`, 'Open journal')}`,
    );

    return this.email.send({
      to: user.email,
      subject: `Your ${data.monthLabel} journal summary`,
      html,
      text: `Journal ${data.monthLabel}: net ${fmt(s.monthNet)}, credits ${fmt(s.creditTotal)}, debits ${fmt(-s.debitTotal)}, ${s.activeDays} active days.`,
    });
  }

  private async sendInvestorDailyEarning(
    userId: string,
    data: {
      amount: number;
      yieldPercent: number;
      balance: number;
      investmentBalance?: number;
      baseBalance?: number;
      autoReinvested?: boolean;
      reinvestAmount?: number;
      feeAmount?: number;
      feePercent?: number;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const investmentBlock =
      data.investmentBalance != null
        ? `<p>Investment balance: <strong>$${data.investmentBalance.toFixed(2)} USDT</strong></p>`
        : '';
    const baseBlock =
      data.baseBalance != null
        ? `<p>Earned on investment principal: <strong>$${data.baseBalance.toFixed(2)} USDT</strong></p>`
        : '';
    const compoundBlock =
      data.autoReinvested &&
      data.reinvestAmount != null &&
      data.feeAmount != null
        ? `<p>Auto-reinvest: <strong>$${data.reinvestAmount.toFixed(2)} USDT</strong> compounded into investment after a <strong>${data.feePercent ?? 10}%</strong> fee ($${data.feeAmount.toFixed(2)} USDT).</p>`
        : '';
    const footerNote = data.autoReinvested
      ? `<p style="color:#94a3b8;font-size:14px;">This earning was applied to your investment balance by platform accounting.</p>`
      : `<p style="color:#94a3b8;font-size:14px;">Earnings are credited to your wallet. Compounding and auto-reinvest are not available.</p>`;
    const html = this.email.layout(
      data.autoReinvested
        ? 'Investor daily earning auto-reinvested'
        : 'Investor daily earning credited',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your investor daily earning at <strong>${data.yieldPercent}%</strong>: <strong>$${data.amount.toFixed(2)} USDT</strong></p>
      ${baseBlock}
      ${compoundBlock}
      ${investmentBlock}
      <p>Wallet balance (available): <strong>$${data.balance.toFixed(2)} USDT</strong></p>
      ${footerNote}
      ${this.email.button(`${this.email.frontendUrl}/invest`, 'View investment')}`,
    );
    return this.email.send({
      to: user.email,
      subject: data.autoReinvested
        ? `Investor earning auto-reinvested — $${(data.reinvestAmount ?? data.amount).toFixed(2)} USDT (${data.yieldPercent}%)`
        : `Investor earning — $${data.amount.toFixed(2)} USDT (${data.yieldPercent}%)`,
      html,
      text: data.autoReinvested
        ? `Investor daily earning: $${data.amount.toFixed(2)} USDT at ${data.yieldPercent}%. Auto-reinvested $${(data.reinvestAmount ?? 0).toFixed(2)} after $${(data.feeAmount ?? 0).toFixed(2)} fee. Investment: $${(data.investmentBalance ?? 0).toFixed(2)}.`
        : `Investor daily earning: $${data.amount.toFixed(2)} USDT at ${data.yieldPercent}%. Wallet: $${data.balance.toFixed(2)}.`,
    });
  }

  private async sendInvestorVipActivated(
    userId: string,
    data: { feeUsdt: number; expiresAt: string },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const expires = data.expiresAt.slice(0, 10);
    const html = this.email.layout(
      'VIP investor activated',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your <strong>VIP</strong> investor badge is active.</p>
      <p>You paid <strong>$${data.feeUsdt.toFixed(2)} USDT</strong> for 30 days (expires <strong>${this.escape(expires)}</strong>).</p>
      <ul>
        <li>Higher default daily yield (10%)</li>
        <li>$0 wallet withdrawal fee</li>
      </ul>
      ${this.email.button(`${this.email.frontendUrl}/dashboard?tab=invest`, 'View Invest')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `VIP activated — expires ${expires}`,
      html,
      text: `VIP investor activated until ${expires}. Higher daily yield + $0 withdrawal fee. No yield on Saturday or Sunday.`,
    });
  }

  private async sendInvestorVipExpiring(
    userId: string,
    data: { expiresAt: string; feeUsdt: number },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const expires = data.expiresAt.slice(0, 10);
    const html = this.email.layout(
      'VIP expiring soon',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your VIP investor badge expires on <strong>${this.escape(expires)}</strong>.</p>
      <p>Renew for <strong>$${data.feeUsdt.toFixed(2)} USDT</strong> from your wallet to keep higher daily yield and $0 withdrawal fees.</p>
      ${this.email.button(`${this.email.frontendUrl}/dashboard?tab=invest`, 'Renew VIP')}`,
    );
    return this.email.send({
      to: user.email,
      subject: `VIP expires ${expires} — renew to keep benefits`,
      html,
      text: `VIP expires ${expires}. Renew for $${data.feeUsdt.toFixed(2)} USDT to keep benefits.`,
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

  /** Admin activated a user in the investor program (complimentary or wallet charge). */
  investorAdminEnrolled(
    userId: string,
    data: {
      investmentAmount: number;
      feeUsdt: number;
      netInvested: number;
      source: 'wallet' | 'comp';
      note?: string | null;
    },
  ) {
    this.dispatch(
      this.sendInvestorAdminEnrolled(userId, data),
      'Investor admin enrolled',
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
      ${this.email.button(`${this.email.frontendUrl}/invest`, 'Open Smart Invest')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Investor program activated',
      html,
      text: `Investor enrollment confirmed ($${data.amount.toFixed(2)} USDT). Open ${this.email.frontendUrl}/invest`,
    });
  }

  private async sendInvestorAdminEnrolled(
    userId: string,
    data: {
      investmentAmount: number;
      feeUsdt: number;
      netInvested: number;
      source: 'wallet' | 'comp';
      note?: string | null;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const complimentary = data.source === 'comp';
    const feeLine = complimentary
      ? `<p>Enrollment fee: <strong>waived</strong> (complimentary activation).</p>`
      : `<p>Enrollment fee: <strong>$${data.feeUsdt.toFixed(2)} USDT</strong> (charged from your wallet).</p>`;
    const noteLine = data.note?.trim()
      ? `<p style="color:#94a3b8;font-size:14px;">Note: ${this.escape(data.note.trim())}</p>`
      : '';
    const html = this.email.layout(
      'You have been enrolled as an investor',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>An administrator activated your <strong>Smart Invest</strong> account.</p>
      <p>Investment amount: <strong>$${data.investmentAmount.toFixed(2)} USDT</strong></p>
      ${feeLine}
      <p>Amount invested: <strong>$${data.netInvested.toFixed(2)} USDT</strong></p>
      ${noteLine}
      <p>Open Invest to review your balance, daily yield, and MT5 settings.</p>
      ${this.email.button(`${this.email.frontendUrl}/invest`, 'Open Smart Invest')}`,
    );
    return this.email.send({
      to: user.email,
      subject: complimentary
        ? 'You have been enrolled in Smart Invest'
        : 'Smart Invest enrollment confirmed',
      html,
      text: complimentary
        ? `An admin enrolled you in Smart Invest. $${data.netInvested.toFixed(2)} USDT invested (fee waived). ${this.email.frontendUrl}/invest`
        : `An admin enrolled you in Smart Invest. $${data.investmentAmount.toFixed(2)} USDT deposit, $${data.feeUsdt.toFixed(2)} fee, $${data.netInvested.toFixed(2)} invested. ${this.email.frontendUrl}/invest`,
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

  accountTransferRequest(
    userId: string,
    data: {
      transferId: string;
      token: string;
      fromEmail: string | null;
      fromDisplayName: string;
      availableBalance: number;
      lockedBalance: number;
      investorBalance: number;
      expiresAt: Date;
    },
  ) {
    return this.sendAccountTransferRequest(userId, data);
  }

  accountTransferInReview(
    userId: string,
    data: {
      transferId: string;
      finalizeAfter: Date;
      fromEmail: string | null;
    },
  ) {
    this.dispatch(
      this.sendAccountTransferInReview(userId, data),
      'Account transfer in review',
    );
  }

  accountTransferCompleted(
    userId: string,
    data: {
      transferId: string;
      fromEmail: string | null;
      availableBalance: number;
      lockedBalance: number;
      investorBalance: number;
    },
  ) {
    this.dispatch(
      this.sendAccountTransferCompleted(userId, data),
      'Account transfer completed',
    );
  }

  accountTransferCancelled(userId: string, data: { transferId: string }) {
    this.dispatch(
      this.sendAccountTransferCancelled(userId, data),
      'Account transfer cancelled',
    );
  }

  private async sendAccountTransferRequest(
    userId: string,
    data: {
      transferId: string;
      token: string;
      fromEmail: string | null;
      fromDisplayName: string;
      availableBalance: number;
      lockedBalance: number;
      investorBalance: number;
      expiresAt: Date;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const url = `${this.email.frontendUrl}/account-transfer?token=${encodeURIComponent(data.token)}`;
    const fromLabel = data.fromEmail
      ? this.escape(data.fromEmail)
      : this.escape(data.fromDisplayName);
    const html = this.email.layout(
      'Approve account asset transfer',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>An administrator started a transfer of assets from <strong>${fromLabel}</strong> onto <strong>this account</strong>.</p>
      <p>Estimated balances to move:</p>
      <ul style="padding-left:18px;color:#cbd5e1;">
        <li>Available: <strong>$${data.availableBalance.toFixed(2)} USDT</strong></li>
        <li>Locked: <strong>$${data.lockedBalance.toFixed(2)} USDT</strong></li>
        <li>Investment: <strong>$${data.investorBalance.toFixed(2)} USDT</strong></li>
      </ul>
      <p>You must read and agree on the linked page. After you agree, assets enter a <strong>24-hour review</strong>. Then the old account is banned and funds appear here.</p>
      <p style="color:#94a3b8;font-size:14px;">Link expires ${this.escape(data.expiresAt.toUTCString())}.</p>
      ${this.email.button(url, 'Review and agree')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Action required: approve account asset transfer',
      html,
      text: `Approve transfer of assets from ${data.fromEmail ?? data.fromDisplayName} to this account: ${url}`,
    });
  }

  private async sendAccountTransferInReview(
    userId: string,
    data: {
      transferId: string;
      finalizeAfter: Date;
      fromEmail: string | null;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Transfer in 24-hour review',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>You approved the asset transfer${data.fromEmail ? ` from <strong>${this.escape(data.fromEmail)}</strong>` : ''}.</p>
      <p>Funds stay in review until <strong>${this.escape(data.finalizeAfter.toUTCString())}</strong>. After that, the old account is banned and balances become available here.</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'Open wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Account transfer is in 24-hour review',
      html,
      text: `Transfer ${data.transferId} is in review until ${data.finalizeAfter.toISOString()}.`,
    });
  }

  private async sendAccountTransferCompleted(
    userId: string,
    data: {
      transferId: string;
      fromEmail: string | null;
      availableBalance: number;
      lockedBalance: number;
      investorBalance: number;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Account transfer completed',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>The asset transfer${data.fromEmail ? ` from <strong>${this.escape(data.fromEmail)}</strong>` : ''} is complete. The old account has been banned.</p>
      <p>Moved: available $${data.availableBalance.toFixed(2)}, locked $${data.lockedBalance.toFixed(2)}, investment $${data.investorBalance.toFixed(2)} USDT (plus history and related program state).</p>
      ${this.email.button(`${this.email.frontendUrl}/wallet`, 'View wallet')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Account transfer completed',
      html,
      text: `Transfer ${data.transferId} completed. Assets are now on this account.`,
    });
  }

  private async sendAccountTransferCancelled(
    userId: string,
    data: { transferId: string },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Account transfer cancelled',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>The pending account asset transfer (<code>${this.escape(data.transferId)}</code>) was cancelled by an administrator. No balances were moved.</p>`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Account transfer cancelled',
      html,
      text: `Transfer ${data.transferId} was cancelled. No balances were moved.`,
    });
  }

  /**
   * Email every user with an address about the 24h yield-hold rule.
   * Sends sequentially with a short delay to respect Resend rate limits.
   */
  async broadcastInvestorYieldHoldPolicy(): Promise<{
    total: number;
    sent: number;
    failed: number;
  }> {
    const users = await this.prisma.user.findMany({
      where: {
        email: { not: null },
        status: { not: 'BANNED' },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    let sent = 0;
    let failed = 0;
    for (const user of users) {
      try {
        const ok = await this.sendInvestorYieldHoldPolicy(user.id);
        if (ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 80));
    }

    this.logger.log(
      `Yield-hold policy broadcast: sent=${sent} failed=${failed} total=${users.length}`,
    );
    return { total: users.length, sent, failed };
  }

  private async sendInvestorYieldHoldPolicy(userId: string) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'New yield rule: 24-hour hold',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>To protect the platform and all investors, we are introducing a clear rule:</p>
      <p><strong>New deposits and investment allocations only start earning daily yield after they have been in place for at least 24 hours.</strong></p>
      <ul style="padding-left:18px;color:#cbd5e1;">
        <li>Smart Invest: amounts moved into investment in the last 24 hours are excluded from that day’s yield.</li>
        <li>Depositor plans: the first daily earning credits after a full 24 hours from plan start.</li>
        <li>Existing capital that has already been invested for 24+ hours continues to earn as usual.</li>
      </ul>
      <p>This stops last-minute deposits timed around the daily payout, followed by an immediate withdrawal.</p>
      <p>Thank you for helping keep returns fair for everyone.</p>
      ${this.email.button(`${this.email.frontendUrl}/invest`, 'Open Invest')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'New rule: deposits earn yield only after 24 hours',
      html,
      text: 'New rule: deposits and investment allocations earn daily yield only after they have been in place for at least 24 hours. Existing capital older than 24 hours is unaffected. See thetradeguard.com/invest',
    });
  }

  /**
   * Email investors with investment balance under $750 about pause / possible ban risk.
   */
  async broadcastInvestorAutoStopPolicy(): Promise<{
    total: number;
    sent: number;
    failed: number;
  }> {
    const users = await this.prisma.user.findMany({
      where: {
        email: { not: null },
        status: { not: 'BANNED' },
        platformWallet: {
          investorBalance: { gt: 0, lt: 750 },
        },
      },
      select: {
        id: true,
        platformWallet: { select: { investorBalance: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    let sent = 0;
    let failed = 0;
    for (const user of users) {
      try {
        const balance = Number(user.platformWallet?.investorBalance ?? 0);
        const ok = await this.sendInvestorAutoStopPolicy(user.id, balance);
        if (ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 80));
    }

    this.logger.log(
      `Investor under-$750 reminder broadcast: sent=${sent} failed=${failed} total=${users.length}`,
    );
    return { total: users.length, sent, failed };
  }

  private async sendInvestorAutoStopPolicy(userId: string, balance: number) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const bal = Number.isFinite(balance) ? balance.toFixed(2) : '0.00';
    const html = this.email.layout(
      'Action required: Smart Invest under $750',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Your Smart Invest balance is currently <strong>$${bal} USDT</strong>, which is below the platform minimum of <strong>$750 USDT</strong>.</p>
      <p><strong>Accounts below $750 may have investment yield paused, and continued non-compliance can lead to account restriction or ban.</strong></p>
      <ul style="padding-left:18px;color:#cbd5e1;">
        <li>Top up so your investment is at least <strong>$750 USDT</strong> to keep earning.</li>
        <li>Or withdraw your balance if you do not want to meet the minimum.</li>
        <li>Daily earnings stay in your wallet — compounding / auto-reinvest is not available.</li>
      </ul>
      <p>Please act soon to avoid yield pause or further account action.</p>
      ${this.email.button(`${this.email.frontendUrl}/invest`, 'Open Smart Invest')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Reminder: Smart Invest under $750 — yield may pause or account may be restricted',
      html,
      text: `Your Smart Invest balance is $${bal} USDT, below the $750 minimum. Yield may be paused and continued non-compliance can lead to restriction or ban. Top up to at least $750 on ${this.email.frontendUrl}/invest, or withdraw. Compounding is not available.`,
    });
  }

  /**
   * Email investors with investment balance ≥ $1000 about loan eligibility.
   */
  async broadcastInvestorLoanEligibilityPolicy(): Promise<{
    total: number;
    sent: number;
    failed: number;
  }> {
    const users = await this.prisma.user.findMany({
      where: {
        email: { not: null },
        status: { not: 'BANNED' },
        platformWallet: {
          investorBalance: { gte: 1000 },
        },
      },
      select: {
        id: true,
        platformWallet: { select: { investorBalance: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    let sent = 0;
    let failed = 0;
    for (const user of users) {
      try {
        const balance = Number(user.platformWallet?.investorBalance ?? 0);
        const ok = await this.sendInvestorLoanEligibilityPolicy(
          user.id,
          balance,
        );
        if (ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 80));
    }

    this.logger.log(
      `Investor loan eligibility broadcast: sent=${sent} failed=${failed} total=${users.length}`,
    );
    return { total: users.length, sent, failed };
  }

  private async sendInvestorLoanEligibilityPolicy(
    userId: string,
    balance: number,
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const bal = Number.isFinite(balance) ? balance.toFixed(2) : '0.00';
    const borrowMax = Number.isFinite(balance)
      ? (balance * 0.8).toFixed(2)
      : '0.00';
    const html = this.email.layout(
      'You may be eligible for an investment loan',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>Because your Smart Invest balance is <strong>$1,000 or more</strong>, you are eligible for our investment loan program.</p>
      <p>Your current investment: <strong>$${bal} USDT</strong> (illustrative borrow capacity up to <strong>$${borrowMax} USDT</strong> — 80%).</p>
      <ul style="padding-left:18px;color:#cbd5e1;">
        <li>Borrow up to <strong>80%</strong> of your investment balance.</li>
        <li>Your investment <strong>keeps working and earning</strong> while the loan is active.</li>
        <li>Daily earnings credit to your wallet — compounding is not available.</li>
      </ul>
      <p>This is an eligibility notice — approval and terms are confirmed by our team. Open Support on the platform to ask Agent or an admin about applying.</p>
      ${this.email.button(`${this.email.frontendUrl}/messages`, 'Message Support')}`,
    );
    return this.email.send({
      to: user.email,
      subject:
        'Eligible: borrow up to 80% of your investment while it keeps earning',
      html,
      text: `With $1,000+ invested (yours: $${bal} USDT), you may borrow up to 80% of your investment while it keeps earning. Compounding is not available. Message Support on ${this.email.frontendUrl}/messages to learn more or apply.`,
    });
  }

  /**
   * Email users with an open APPROVED loan about withdraw restriction.
   */
  async broadcastActiveLoanWithdrawPolicy(): Promise<{
    total: number;
    sent: number;
    failed: number;
  }> {
    await this.backfillActiveLoanWithdrawnAmounts();

    const loans = await this.prisma.loan.findMany({
      where: { status: 'APPROVED' },
      select: {
        id: true,
        userId: true,
        term: true,
        principal: true,
        totalDue: true,
        withdrawnAgainstLoan: true,
        user: { select: { email: true, status: true } },
      },
      orderBy: { approvedAt: 'asc' },
    });

    const seen = new Set<string>();
    let sent = 0;
    let failed = 0;
    let total = 0;

    for (const loan of loans) {
      if (!loan.user.email?.trim() || loan.user.status === 'BANNED') continue;
      if (seen.has(loan.userId)) continue;
      seen.add(loan.userId);
      total++;
      try {
        const principal = Number(loan.principal);
        const withdrawn = Number(loan.withdrawnAgainstLoan ?? 0);
        const remaining = Math.max(
          0,
          Math.round((principal - withdrawn) * 100) / 100,
        );
        const ok = await this.sendActiveLoanWithdrawPolicy(loan.userId, {
          term: String(loan.term),
          principal,
          totalDue: Number(loan.totalDue),
          remaining,
        });
        if (ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 80));
    }

    this.logger.log(
      `Active loan withdraw policy broadcast: sent=${sent} failed=${failed} total=${total}`,
    );
    return { total, sent, failed };
  }

  /** Estimate prior cash-outs against open loans so remaining caps are fair. */
  private async backfillActiveLoanWithdrawnAmounts() {
    const loans = await this.prisma.loan.findMany({
      where: { status: 'APPROVED', withdrawnAgainstLoan: 0 },
      select: {
        id: true,
        userId: true,
        principal: true,
        approvedAt: true,
        createdAt: true,
      },
    });
    for (const loan of loans) {
      const since = loan.approvedAt ?? loan.createdAt;
      const agg = await this.prisma.walletTransaction.aggregate({
        where: {
          userId: loan.userId,
          type: 'DEPOSITOR_WITHDRAW',
          createdAt: { gte: since },
        },
        _sum: { amount: true },
      });
      const withdrawnAbs = Math.abs(Number(agg._sum.amount ?? 0));
      if (withdrawnAbs <= 0) continue;
      const principal = Number(loan.principal);
      const credited = Math.min(
        principal,
        Math.round(withdrawnAbs * 100) / 100,
      );
      await this.prisma.loan.update({
        where: { id: loan.id },
        data: { withdrawnAgainstLoan: credited },
      });
    }
  }

  private async sendActiveLoanWithdrawPolicy(
    userId: string,
    data: {
      term: string;
      principal: number;
      totalDue: number;
      remaining: number;
    },
  ) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Loan update: withdrawals limited until you repay',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>You currently have an open <strong>${this.escape(data.term)}</strong> loan.</p>
      <p><strong>New rule:</strong> until the loan is repaid, you may only withdraw the loan advance — not other wallet balances or earnings.</p>
      <ul style="padding-left:18px;color:#cbd5e1;">
        <li>Loan advance: <strong>$${data.principal.toFixed(2)} USDT</strong></li>
        <li>Still withdrawable from this advance: <strong>$${data.remaining.toFixed(2)} USDT</strong></li>
        <li>Amount to repay: <strong>$${data.totalDue.toFixed(2)} USDT</strong></li>
      </ul>
      <p>After you repay, full withdrawals unlock again.</p>
      ${this.email.button(`${this.email.frontendUrl}/loans`, 'View / repay loan')}`,
    );
    return this.email.send({
      to: user.email,
      subject:
        'Loan open: only the loan advance can be withdrawn until you repay',
      html,
      text: `Open ${data.term} loan: until you repay $${data.totalDue.toFixed(2)}, you may only withdraw the loan advance ($${data.principal.toFixed(2)}; $${data.remaining.toFixed(2)} left). Repay at ${this.email.frontendUrl}/loans`,
    });
  }

  /**
   * Email every user with an address: trader/prop program sunset → investment focus.
   */
  async broadcastTraderProgramSunset(): Promise<{
    total: number;
    sent: number;
    failed: number;
  }> {
    const users = await this.prisma.user.findMany({
      where: {
        email: { not: null },
        status: { not: 'BANNED' },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    let sent = 0;
    let failed = 0;
    for (const user of users) {
      try {
        const ok = await this.sendTraderProgramSunset(user.id);
        if (ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 80));
    }

    this.logger.log(
      `Trader program sunset broadcast: sent=${sent} failed=${failed} total=${users.length}`,
    );
    return { total: users.length, sent, failed };
  }

  private async sendTraderProgramSunset(userId: string) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'An important update from TraderRank Pro',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>We are writing with a difficult but necessary update about the future of TraderRank Pro (Trade Guard).</p>
      <p>Over the past months our community and product have grown most strongly around <strong>Smart Invest</strong> — daily yield, transparent fees, and a clearer path for capital. After careful review, we have decided to <strong>conclude the trader competition and prop-style funding programs</strong> as part of our core offering.</p>
      <p>This was not an easy decision. We are genuinely sorry to see the competitive trading chapter close, and we are grateful for every setup submitted, every claim reviewed, and every trader who trusted us with their craft. Your participation helped shape who we are.</p>
      <p><strong>What this means</strong></p>
      <ul style="padding-left:18px;color:#cbd5e1;">
        <li>New focus of the platform is <strong>investment</strong>: Smart Invest, wallet deposits, daily earnings, and withdrawals after KYC.</li>
        <li>Trader leaderboard competition, virtual funded accounts, and prop-style evaluation pathways are being wound down as product priorities.</li>
        <li>If you hold wallet or investment balances, those remain yours — continue to manage them from Invest and Wallet.</li>
        <li>Support remains available in Messages if you have questions about balances, KYC, or withdrawals.</li>
      </ul>
      <p>We regret any disappointment this causes, especially for members who joined primarily to compete and get funded. We believe concentrating on investment services will let us serve you more clearly and reliably going forward.</p>
      <p>Thank you for being part of TraderRank Pro. We hope you will stay with us on the investment path.</p>
      <p style="color:#94a3b8;font-size:14px;">— The TraderRank Pro team</p>
      ${this.email.button(`${this.email.frontendUrl}/invest`, 'Open Smart Invest')}`,
    );
    return this.email.send({
      to: user.email,
      subject:
        'TraderRank Pro update: closing trader & prop programs — focusing on Smart Invest',
      html,
      text: `Hi ${user.name}, We are concluding TraderRank Pro’s trader competition and prop-style funding programs and focusing the platform on Smart Invest. We regret seeing that chapter end and thank you for your participation. Wallet and investment balances remain yours. Open ${this.email.frontendUrl}/invest or message Support with questions. — The TraderRank Pro team`,
    });
  }

  /**
   * Email active Smart Invest users about self-serve reinvest (30% commission).
   */
  async broadcastInvestorReinvestPolicy(): Promise<{
    total: number;
    sent: number;
    failed: number;
  }> {
    const users = await this.prisma.user.findMany({
      where: {
        investorActive: true,
        email: { not: null },
        status: { not: 'BANNED' },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    let sent = 0;
    let failed = 0;
    for (const user of users) {
      try {
        const ok = await this.sendInvestorReinvestPolicy(user.id);
        if (ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 80));
    }

    this.logger.log(
      `Investor reinvest policy broadcast: sent=${sent} failed=${failed} total=${users.length}`,
    );
    return { total: users.length, sent, failed };
  }

  private async sendInvestorReinvestPolicy(userId: string) {
    const user = await this.userContact(userId);
    if (!user) return false;
    const html = this.email.layout(
      'Smart Invest update: reinvest is back',
      `<p>Hi ${this.escape(user.name)},</p>
      <p>You can again move earnings from your <strong>wallet</strong> back into <strong>Smart Invest</strong> from the Invest page.</p>
      <p><strong>How it works</strong></p>
      <ul style="padding-left:18px;color:#cbd5e1;">
        <li>Open <strong>Invest → Move funds → Wallet → Investment</strong></li>
        <li>A <strong>30% commission</strong> is deducted from the amount you move; the remainder is added to your investment balance</li>
        <li>Example: reinvest <strong>$100</strong> from wallet → <strong>$70</strong> added to Smart Invest ($30 commission)</li>
        <li>New allocations still follow the <strong>24-hour yield hold</strong> before they earn daily yield</li>
        <li>If you have an <strong>open loan</strong>, reinvest stays paused until you repay</li>
        <li><strong>VVIP</strong> members: no commission on reinvest (unchanged)</li>
      </ul>
      <p>Auto-reinvest (automatic compounding of daily earnings) remains off — use manual reinvest when you choose.</p>
      ${this.email.button(`${this.email.frontendUrl}/invest`, 'Open Invest')}`,
    );
    return this.email.send({
      to: user.email,
      subject: 'Smart Invest: wallet → investment reinvest is available (30% fee)',
      html,
      text: `Hi ${user.name}, Smart Invest reinvest is back on Invest. Move wallet → investment with a 30% commission on the amount moved (VVIP: no fee). Example: $100 moved → $70 to investment. Open ${this.email.frontendUrl}/invest`,
    });
  }
}
