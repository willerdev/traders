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
      <p><strong>$${data.reward.toFixed(2)}</strong> has been credited to your wallet.</p>
      ${this.email.button(`${this.email.frontendUrl}/tp-claims`, 'View TP claims')}`,
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

  paymentConfirmed(userId: string) {
    this.dispatch(this.sendPaymentConfirmed(userId), 'Payment confirmed');
  }

  private async sendPaymentConfirmed(userId: string) {
    const user = await this.userContact(userId);
    if (!user) return false;

    const html = this.email.layout(
      'Payment received',
      `<p>Hi ${user.name},</p>
      <p>We received your registration payment. Your account is now active.</p>
      ${this.email.button(`${this.email.frontendUrl}/dashboard`, 'Start trading')}`,
    );

    return this.email.send({
      to: user.email,
      subject: 'Payment confirmed — account activated',
      html,
      text: 'Registration payment confirmed. Your account is active.',
    });
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
