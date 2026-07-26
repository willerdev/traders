import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { InvestorService } from '../investor/investor.service';
import { PayoutService } from '../payouts/payout.service';
import { WalletService } from '../wallet/wallet.service';
import { isInvestorVipActive, VIP_AI_WITHDRAW_MIN_AGE_MS } from '../investor/investor-vip.util';
import { WALLET_WITHDRAWAL_FEE_USD } from '../common/constants';
import { isMomoWithdrawalNetwork } from '../flutterwave/flutterwave.constants';

type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
type HistoryItem = { role: 'user' | 'assistant'; content: string };

type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

type ChatMessage = {
  role: ChatRole;
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

const ESCALATION_PATTERNS = [
  /\b(speak|talk|chat)\s+(to|with)\s+(a\s+)?(human|person|admin|agent|support\s+team|real\s+person)\b/i,
  /\b(connect|transfer|escalate)\s+(me\s+)?(to\s+)?(admin|human|support)\b/i,
  /\b(request|need|want)\s+(a\s+)?(human|admin|real\s+person)\b/i,
  /\bhuman\s+support\b/i,
  /\bspeak\s+to\s+admin\b/i,
  /\btalk\s+to\s+admin\b/i,
];

const SUPPORT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_balances',
      description:
        'Get the user wallet available balance, locked balance, investment balance, VIP status, and auto-reinvest setting.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_saved_withdrawal_wallets',
      description:
        'List this user’s saved withdrawal destinations (needed before request_withdrawal). Prefer verified wallets.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_pending_withdrawals',
      description:
        'List this user’s pending wallet withdrawals (PENDING), including age in minutes and whether VIP AI can approve them yet (30+ minutes).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_withdrawal',
      description:
        'Create a wallet withdrawal for this user to a saved withdrawal wallet. Requires KYC approved and sufficient available balance. Non-VIP pays a $3 fee from the gross amount. Requires confirmed: true after the user clearly asks to withdraw a specific amount to a specific saved wallet.',
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Gross USDT amount to withdraw from available balance',
          },
          saved_wallet_id: {
            type: 'string',
            description: 'id from list_saved_withdrawal_wallets',
          },
          confirmed: {
            type: 'boolean',
            description: 'Must be true when the user confirmed the withdraw',
          },
        },
        required: ['amount', 'saved_wallet_id', 'confirmed'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'approve_withdrawal',
      description:
        'Approve and send a pending wallet withdrawal for this VIP user. Only works if investor VIP is active and the request has been pending at least 30 minutes. Requires confirmed: true after the user clearly asks to approve/confirm.',
      parameters: {
        type: 'object',
        properties: {
          payout_id: {
            type: 'string',
            description: 'Payout id from list_pending_withdrawals',
          },
          confirmed: {
            type: 'boolean',
            description: 'Must be true when the user confirmed approval',
          },
        },
        required: ['payout_id', 'confirmed'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transfer_wallet_to_investment',
      description:
        'Move USDT from available wallet to Smart Invest investment balance. User must be an enrolled investor. Requires confirmed: true.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'USDT amount to move' },
          confirmed: { type: 'boolean' },
        },
        required: ['amount', 'confirmed'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transfer_investment_to_wallet',
      description:
        'Move USDT from Smart Invest investment balance back to available wallet. Requires confirmed: true.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'USDT amount to move' },
          confirmed: { type: 'boolean' },
        },
        required: ['amount', 'confirmed'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_auto_reinvest',
      description:
        'Enable or disable auto-reinvest of investor daily earnings for compounding. When enabled, 90% of each daily return compounds into investment and 10% is charged as a platform fee on the full daily earning. Requires confirmed: true. User must be an enrolled investor.',
      parameters: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            description: 'true to enable auto-reinvest compounding, false to credit earnings to wallet',
          },
          confirmed: { type: 'boolean' },
        },
        required: ['enabled', 'confirmed'],
        additionalProperties: false,
      },
    },
  },
] as const;

@Injectable()
export class SupportAgentService {
  private readonly logger = new Logger(SupportAgentService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly knowledge: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private moduleRef: ModuleRef,
  ) {
    this.apiKey = this.config.get<string>('DEEPSEEK_API_KEY') || '';
    this.model = this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';
    this.baseUrl =
      this.config.get<string>('DEEPSEEK_API_URL') ||
      'https://api.deepseek.com/v1';

    const candidates = [
      join(process.cwd(), 'dist', 'src', 'ai', 'knowledge', 'platform-knowledge.md'),
      join(process.cwd(), 'src', 'ai', 'knowledge', 'platform-knowledge.md'),
    ];
    let loaded = '';
    for (const knowledgePath of candidates) {
      try {
        loaded = readFileSync(knowledgePath, 'utf8');
        break;
      } catch {
        /* try next */
      }
    }
    this.knowledge =
      loaded ||
      'TraderRank Pro is a trader talent-discovery platform. Traders submit setups, compete on a leaderboard, and can earn payouts. Direct account-specific questions to a human admin.';
    if (!loaded) {
      this.logger.warn('Platform knowledge file not found — using fallback');
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  wantsHumanSupport(message: string): boolean {
    const text = message.trim();
    return ESCALATION_PATTERNS.some((re) => re.test(text));
  }

  async generateReply(
    userId: string,
    userMessage: string,
    history: HistoryItem[],
  ): Promise<string> {
    if (!this.isConfigured) {
      return this.fallbackReply(userMessage);
    }

    const vip = await this.loadVip(userId);
    const systemPrompt = this.buildSystemPrompt(vip.active);
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-12).map((h) => ({
        role: h.role as ChatRole,
        content: h.content,
      })),
      { role: 'user', content: userMessage },
    ];

    try {
      for (let step = 0; step < 6; step += 1) {
        const completion = await this.callDeepSeek(messages, true);
        const assistantMsg = completion.choices?.[0]?.message;
        if (!assistantMsg) break;

        if (assistantMsg.tool_calls?.length) {
          messages.push({
            role: 'assistant',
            content: assistantMsg.content ?? null,
            tool_calls: assistantMsg.tool_calls,
          });

          for (const call of assistantMsg.tool_calls) {
            const result = await this.runTool(
              userId,
              call.function.name,
              call.function.arguments,
            );
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: call.function.name,
              content: JSON.stringify(result),
            });
          }
          continue;
        }

        const content = assistantMsg.content?.trim();
        if (content) return content;
        break;
      }
      return this.fallbackReply(userMessage);
    } catch (err) {
      this.logger.error(
        `Support agent error: ${err instanceof Error ? err.message : err}`,
      );
      return this.fallbackReply(userMessage);
    }
  }

  private buildSystemPrompt(vipActive: boolean) {
    return `You are Agent, the TraderRank Pro support assistant in the Messages chat.

${this.knowledge}

Account tools:
- You CAN look up this user's balances, saved withdrawal wallets, and pending withdrawals with tools.
- You CAN request_withdrawal for them when they ask to withdraw — first list_saved_withdrawal_wallets, confirm amount + destination, then call with confirmed:true. KYC must already be approved.
- Investor VIP active for this user: ${vipActive ? 'YES' : 'NO'}.
- If VIP is YES, you may approve_withdrawal for their own PENDING wallet withdrawals that have been pending 30+ minutes, and you may move funds wallet↔investment when they ask.
- If VIP is NO, explain they need Investor VIP ($20/month from Invest) for AI withdrawal approval (and $0 withdraw fee). They can still request_withdrawal without VIP (standard $${WALLET_WITHDRAWAL_FEE_USD} fee). Transfers still require an enrolled investor account.
- Enrolled investors can set_auto_reinvest (compounding): 10% fee on the full daily earning, 90% added to investment. Confirm the fee before enabling.
- For request_withdrawal, approve_withdrawal, transfers, or set_auto_reinvest: only pass confirmed:true when the user clearly asked to confirm. If unclear, ask them to confirm first.
- After tools run, summarize what happened in plain language (amounts, new balances, payout status, fees).
- Keep replies concise. Plain text, no markdown headers. Bullet lists OK.
- Never invent payout_id or saved_wallet_id — only use IDs from list tools.
- If unsure or they need a human, suggest Speak to admin.`;
  }

  private async loadVip(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        investorVipActive: true,
        investorVipExpiresAt: true,
        investorActive: true,
      },
    });
    return {
      active: isInvestorVipActive(user ?? {}),
      investorActive: Boolean(user?.investorActive),
    };
  }

  private async callDeepSeek(messages: ChatMessage[], withTools: boolean) {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: 0.3,
      max_tokens: 700,
    };
    if (withTools) {
      body.tools = SUPPORT_TOOLS;
      body.tool_choice = 'auto';
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.warn(`DeepSeek support reply failed: ${err.slice(0, 200)}`);
      throw new Error(`DeepSeek HTTP ${res.status}`);
    }

    return (await res.json()) as {
      choices?: { message?: ChatMessage }[];
    };
  }

  private parseArgs(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(raw || '{}') as unknown;
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private async runTool(
    userId: string,
    name: string,
    argsJson: string,
  ): Promise<Record<string, unknown>> {
    const args = this.parseArgs(argsJson);
    try {
      switch (name) {
        case 'get_balances':
          return this.toolGetBalances(userId);
        case 'list_saved_withdrawal_wallets':
          return this.toolListSavedWallets(userId);
        case 'list_pending_withdrawals':
          return this.toolListPendingWithdrawals(userId);
        case 'request_withdrawal':
          return this.toolRequestWithdrawal(userId, args);
        case 'approve_withdrawal':
          return this.toolApproveWithdrawal(userId, args);
        case 'transfer_wallet_to_investment':
          return this.toolTransfer(userId, args, 'to_investment');
        case 'transfer_investment_to_wallet':
          return this.toolTransfer(userId, args, 'to_wallet');
        case 'set_auto_reinvest':
          return this.toolSetAutoReinvest(userId, args);
        default:
          return { ok: false, error: `Unknown tool: ${name}` };
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async toolGetBalances(userId: string) {
    const [wallet, user, settings] = await Promise.all([
      this.prisma.platformWallet.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          investorActive: true,
          investorVipActive: true,
          investorVipExpiresAt: true,
        },
      }),
      this.prisma.investorSettings.findUnique({
        where: { userId },
        select: { autoReinvestEarnings: true },
      }),
    ]);
    const vipActive = isInvestorVipActive(user ?? {});
    return {
      ok: true,
      availableBalance: Number(wallet?.availableBalance ?? 0),
      lockedBalance: Number(wallet?.lockedBalance ?? 0),
      investmentBalance: Number(wallet?.investorBalance ?? 0),
      investorActive: Boolean(user?.investorActive),
      vipActive,
      vipExpiresAt: user?.investorVipExpiresAt?.toISOString() ?? null,
      autoReinvestEarnings: Boolean(settings?.autoReinvestEarnings),
      withdrawalFeeUsdt: vipActive ? 0 : WALLET_WITHDRAWAL_FEE_USD,
      note: vipActive
        ? 'VIP active — $0 withdraw fee; can approve withdrawals pending 30+ minutes'
        : `VIP inactive — $${WALLET_WITHDRAWAL_FEE_USD} withdraw fee; AI cannot approve withdrawals`,
    };
  }

  private async toolListSavedWallets(userId: string) {
    const wallets = await this.prisma.savedWithdrawalWallet.findMany({
      where: { userId },
      orderBy: [{ verifiedAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
      select: {
        id: true,
        label: true,
        address: true,
        network: true,
        verifiedAt: true,
      },
    });
    return {
      ok: true,
      wallets: wallets.map((w) => ({
        saved_wallet_id: w.id,
        label: w.label,
        address: w.address,
        network: w.network,
        verified: Boolean(w.verifiedAt),
        withdrawSupported:
          w.network === 'TRC20' || isMomoWithdrawalNetwork(w.network),
      })),
      note:
        wallets.length === 0
          ? 'No saved wallets — user must add one on Wallet before withdrawing'
          : 'Use saved_wallet_id with request_withdrawal',
    };
  }

  private async toolListPendingWithdrawals(userId: string) {
    const vip = await this.loadVip(userId);
    const items = await this.prisma.payout.findMany({
      where: {
        userId,
        source: 'DEPOSITOR',
        status: 'PENDING',
      },
      orderBy: { requestedAt: 'asc' },
      take: 20,
    });
    const now = Date.now();
    return {
      ok: true,
      vipActive: vip.active,
      withdrawals: items.map((p) => {
        const ageMs = now - p.requestedAt.getTime();
        const ageMinutes = Math.floor(ageMs / 60000);
        const eligible =
          vip.active && ageMs >= VIP_AI_WITHDRAW_MIN_AGE_MS;
        return {
          payout_id: p.id,
          amountUsdt: Number(p.traderShare),
          grossUsdt: Number(p.virtualProfit),
          destination: p.walletAddress,
          method: p.payoutMethod,
          requestedAt: p.requestedAt.toISOString(),
          ageMinutes,
          minutesUntilAiCanApprove: eligible
            ? 0
            : Math.max(
                0,
                Math.ceil((VIP_AI_WITHDRAW_MIN_AGE_MS - ageMs) / 60000),
              ),
          aiCanApprove: eligible,
        };
      }),
    };
  }

  private async toolRequestWithdrawal(
    userId: string,
    args: Record<string, unknown>,
  ) {
    if (args.confirmed !== true) {
      return {
        ok: false,
        error: 'Ask the user to confirm amount and destination, then call again with confirmed: true',
      };
    }
    const amount = Number(args.amount);
    const savedWalletId = String(args.saved_wallet_id || '').trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: 'amount must be a positive number' };
    }
    if (!savedWalletId) {
      return { ok: false, error: 'saved_wallet_id is required' };
    }

    const wallet = this.moduleRef.get(WalletService, { strict: false });
    const result = await wallet.withdraw(userId, amount, savedWalletId);
    return { ok: true, ...result };
  }

  private async toolApproveWithdrawal(
    userId: string,
    args: Record<string, unknown>,
  ) {
    if (args.confirmed !== true) {
      return {
        ok: false,
        error: 'Ask the user to confirm, then call again with confirmed: true',
      };
    }
    const payoutId = String(args.payout_id || '').trim();
    if (!payoutId) {
      return { ok: false, error: 'payout_id is required' };
    }

    const payouts = this.moduleRef.get(PayoutService, { strict: false });
    const result = await payouts.approveVipAiWithdrawal(userId, payoutId);
    return { ok: true, ...result };
  }

  private async toolTransfer(
    userId: string,
    args: Record<string, unknown>,
    direction: 'to_investment' | 'to_wallet',
  ) {
    if (args.confirmed !== true) {
      return {
        ok: false,
        error: 'Ask the user to confirm, then call again with confirmed: true',
      };
    }
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: 'amount must be a positive number' };
    }
    const investor = this.moduleRef.get(InvestorService, { strict: false });
    const result = await investor.transferInvestment(
      userId,
      amount,
      direction,
      { adminId: `ai_support_${userId}` },
    );
    return {
      ok: true,
      ...result,
      direction,
    };
  }

  private async toolSetAutoReinvest(
    userId: string,
    args: Record<string, unknown>,
  ) {
    if (args.confirmed !== true) {
      return {
        ok: false,
        error:
          'Confirm that the user understands the 10% fee on full daily earnings, then call again with confirmed: true',
      };
    }
    if (typeof args.enabled !== 'boolean') {
      return { ok: false, error: 'enabled must be true or false' };
    }
    const investor = this.moduleRef.get(InvestorService, { strict: false });
    const result = await investor.setAutoReinvestEarnings(
      userId,
      args.enabled,
    );
    return { ok: true, ...result };
  }

  private fallbackReply(userMessage: string): string {
    const lower = userMessage.toLowerCase();
    if (lower.includes('kyc')) {
      return 'KYC is submitted in Settings under the verification section. Upload your ID and a selfie. Approval is required before payouts. Check your KYC status on the Settings or Payouts page.';
    }
    if (lower.includes('reinvest') || lower.includes('compound')) {
      return 'On Invest you can turn on auto-reinvest so daily earnings compound into your investment. A 10% fee applies to the full daily return (90% is reinvested). Ask me to enable or disable it, or toggle it on Invest.';
    }
    if (lower.includes('vip') || lower.includes('withdraw')) {
      return 'I can request a wallet withdrawal for you after KYC — say how much and which saved wallet, then confirm. Investor VIP ($20/month on Invest) unlocks $0 withdrawal fees and lets me approve pending withdrawals after 30 minutes. Or tap Speak to admin.';
    }
    if (lower.includes('invest') || lower.includes('transfer')) {
      return 'On Invest you can move funds between wallet and investment. If you are enrolled, ask me to move a specific USDT amount either way and confirm. For help, tap Speak to admin.';
    }
    if (lower.includes('tp') || lower.includes('claim')) {
      return 'To claim take profit, go to Dashboard → Unresolved Setups, upload before and after screenshots, and wait for admin review on the TP Claims page.';
    }
    return 'Thanks for reaching out! I can help with setups, KYC, wallet withdrawals, VIP approvals, auto-reinvest, and investment transfers. For account-specific issues, tap "Speak to admin".';
  }
}
