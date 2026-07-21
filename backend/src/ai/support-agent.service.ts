import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { InvestorService } from '../investor/investor.service';
import { PayoutService } from '../payouts/payout.service';
import { isInvestorVipActive, VIP_AI_WITHDRAW_MIN_AGE_MS } from '../investor/investor-vip.util';

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
        'Get the user wallet available balance, locked balance, investment balance, and VIP status.',
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
- You CAN look up this user's balances and pending withdrawals with tools.
- Investor VIP active for this user: ${vipActive ? 'YES' : 'NO'}.
- If VIP is YES, you may approve_withdrawal for their own PENDING wallet withdrawals that have been pending 30+ minutes, and you may move funds wallet↔investment when they ask.
- If VIP is NO, explain they need Investor VIP ($20/month from Invest) for AI withdrawal approval. Transfers still require an enrolled investor account.
- For approve_withdrawal or transfers: only pass confirmed:true when the user clearly asked to approve/confirm/send/move. If unclear, ask them to confirm first.
- After tools run, summarize what happened in plain language (amounts, new balances, payout status).
- Keep replies concise. Plain text, no markdown headers. Bullet lists OK.
- Never invent payout_id — only use IDs from list_pending_withdrawals.
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
        case 'list_pending_withdrawals':
          return this.toolListPendingWithdrawals(userId);
        case 'approve_withdrawal':
          return this.toolApproveWithdrawal(userId, args);
        case 'transfer_wallet_to_investment':
          return this.toolTransfer(userId, args, 'to_investment');
        case 'transfer_investment_to_wallet':
          return this.toolTransfer(userId, args, 'to_wallet');
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
    const [wallet, user] = await Promise.all([
      this.prisma.platformWallet.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          investorActive: true,
          investorVipActive: true,
          investorVipExpiresAt: true,
        },
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
      note: vipActive
        ? 'VIP active — can approve withdrawals pending 30+ minutes'
        : 'VIP inactive — AI cannot approve withdrawals',
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

  private fallbackReply(userMessage: string): string {
    const lower = userMessage.toLowerCase();
    if (lower.includes('kyc')) {
      return 'KYC is submitted in Settings under the verification section. Upload your ID and a selfie. Approval is required before payouts. Check your KYC status on the Settings or Payouts page.';
    }
    if (lower.includes('vip') || lower.includes('withdraw')) {
      return 'Wallet withdrawals are requested from Wallet after KYC. Investor VIP ($20/month on Invest) unlocks $0 withdrawal fees and lets me approve withdrawals that have been pending 30+ minutes — say “approve my withdraw” once VIP is active. Or tap Speak to admin.';
    }
    if (lower.includes('invest') || lower.includes('transfer')) {
      return 'On Invest you can move funds between wallet and investment. If you are enrolled, ask me to move a specific USDT amount either way and confirm. For help, tap Speak to admin.';
    }
    if (lower.includes('tp') || lower.includes('claim')) {
      return 'To claim take profit, go to Dashboard → Unresolved Setups, upload before and after screenshots, and wait for admin review on the TP Claims page.';
    }
    return 'Thanks for reaching out! I can help with setups, KYC, wallet, VIP withdrawals, and investment transfers. For account-specific issues, tap "Speak to admin".';
  }
}
