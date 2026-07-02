import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ComplianceService } from '../compliance/compliance.service';
import { SignalsService } from '../signals/signals.service';

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

const EXECUTE_TOOLS = new Set([
  'place_trade',
  'close_trade',
  'close_all_trades',
  'set_breakeven',
  'partial_close',
  'update_stops',
  'invalidate_setup',
  'close_position',
]);

const MT5_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_running_trades',
      description:
        'Get open MT5 positions: symbol, direction, volume, P/L, signal_id, position_id, and action flags.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_open_setups',
      description:
        'List open submitted setups with resolution flags (canPlaceTrade, canInvalidate, live trade state).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quotes',
      description: 'Live bid/ask and change vs entry for symbols with open setups.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_mt5_terminal',
      description:
        'Full MT5 snapshot: account balance/equity/P/L, setups, running trades, history stats.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_setup_details',
      description: 'Resolution and live trade details for one setup by signal_id.',
      parameters: {
        type: 'object',
        properties: {
          signal_id: { type: 'string', description: 'Setup UUID' },
        },
        required: ['signal_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'place_trade',
      description: 'Open/place a trade for an open setup on platform MT5.',
      parameters: {
        type: 'object',
        properties: {
          signal_id: { type: 'string' },
          confirmed: {
            type: 'boolean',
            description: 'Must be true after user explicitly confirms.',
          },
        },
        required: ['signal_id', 'confirmed'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_trade',
      description: 'Close a running trade or cancel pending order for a setup.',
      parameters: {
        type: 'object',
        properties: {
          signal_id: { type: 'string' },
          confirmed: { type: 'boolean' },
        },
        required: ['signal_id', 'confirmed'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_all_trades',
      description: 'Close every open MT5 position for this user.',
      parameters: {
        type: 'object',
        properties: {
          confirmed: { type: 'boolean' },
        },
        required: ['confirmed'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_breakeven',
      description: 'Move stop loss to breakeven (entry) for a running setup.',
      parameters: {
        type: 'object',
        properties: {
          signal_id: { type: 'string' },
          confirmed: { type: 'boolean' },
        },
        required: ['signal_id', 'confirmed'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'partial_close',
      description: 'Partially close lots from a running position (volume must be less than open size).',
      parameters: {
        type: 'object',
        properties: {
          signal_id: { type: 'string' },
          volume: { type: 'number', description: 'Lots to close, e.g. 0.01' },
          confirmed: { type: 'boolean' },
        },
        required: ['signal_id', 'volume', 'confirmed'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_stops',
      description: 'Update stop loss and/or take profit on a live setup.',
      parameters: {
        type: 'object',
        properties: {
          signal_id: { type: 'string' },
          stop_loss: { type: 'number' },
          take_profit: { type: 'number' },
          confirmed: { type: 'boolean' },
        },
        required: ['signal_id', 'confirmed'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'invalidate_setup',
      description: 'Cancel/archive an open setup (not running).',
      parameters: {
        type: 'object',
        properties: {
          signal_id: { type: 'string' },
          reason: { type: 'string' },
          confirmed: { type: 'boolean' },
        },
        required: ['signal_id', 'confirmed'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_position',
      description: 'Close by broker position_id when signal_id is unknown.',
      parameters: {
        type: 'object',
        properties: {
          position_id: { type: 'string' },
          confirmed: { type: 'boolean' },
        },
        required: ['position_id', 'confirmed'],
        additionalProperties: false,
      },
    },
  },
];

@Injectable()
export class Mt5AssistantService {
  private readonly logger = new Logger(Mt5AssistantService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(
    private config: ConfigService,
    private signals: SignalsService,
    private compliance: ComplianceService,
  ) {
    this.apiKey = this.config.get<string>('DEEPSEEK_API_KEY') || '';
    this.model = this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';
    this.baseUrl =
      this.config.get<string>('DEEPSEEK_API_URL') ||
      'https://api.deepseek.com/v1';
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async chat(userId: string, message: string, history: HistoryItem[] = []) {
    await this.compliance.requireActiveTrader(userId);

    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'MT5 assistant is not configured (DeepSeek API key missing)',
      );
    }

    const context = await this.buildContextSnapshot(userId);
    const systemPrompt = this.buildSystemPrompt(context);
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10).map((h) => ({
        role: h.role as ChatRole,
        content: h.content,
      })),
      { role: 'user', content: message },
    ];

    const actionsTaken: string[] = [];
    let reply = '';

    for (let step = 0; step < 8; step += 1) {
      const completion = await this.callDeepSeek(messages);
      const choice = completion.choices?.[0];
      const assistantMsg = choice?.message;
      if (!assistantMsg) break;

      if (assistantMsg.tool_calls?.length) {
        messages.push({
          role: 'assistant',
          content: assistantMsg.content ?? null,
          tool_calls: assistantMsg.tool_calls,
        });

        for (const call of assistantMsg.tool_calls) {
          const { result, actionLabel } = await this.runTool(
            userId,
            call.function.name,
            call.function.arguments,
          );
          if (actionLabel) actionsTaken.push(actionLabel);
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      reply = assistantMsg.content?.trim() ?? '';
      break;
    }

    if (!reply) {
      reply =
        actionsTaken.length > 0
          ? `Done. Actions: ${actionsTaken.join('; ')}`
          : 'I could not complete that request. Try rephrasing or ask me to check your open trades first.';
    }

    return {
      reply,
      actionsTaken,
      configured: true,
    };
  }

  private buildSystemPrompt(context: string) {
    return `You are TradePro, a professional MT5 trading assistant on TraderRank Pro.

You help the trader manage platform MT5: quotes, open setups, running positions, breakeven, partial closes, stop updates, placing trades, and closing positions.

Current account snapshot:
${context}

Rules:
- Speak like an experienced trader: clear, concise, confident. No fluff.
- ALWAYS read current state with tools before executing trades.
- For place, close, close_all, breakeven, partial_close, update_stops, invalidate, or close_position: ask the user to confirm unless they clearly said yes/confirm/do it/go ahead in the same message. Pass confirmed: true only when executing.
- Never invent signal_id or position_id — only use IDs from tool results.
- After actions, summarize symbol, direction, volume, and P/L when available.
- If multiple setups match, ask which symbol.
- You cannot submit new chart setups — only manage existing open setups and live trades.
- Plain text only, no markdown headers.`;
  }

  private async buildContextSnapshot(userId: string) {
    try {
      const [running, terminal] = await Promise.all([
        this.signals.getUserMt5RunningTrades(userId),
        this.signals.getUserMt5Terminal(userId),
      ]);
      const acct = terminal.account;
      const lines = [
        acct
          ? `Starting ${acct.startingBalance} ${acct.currency}, Equity ${acct.equity}, Floating ${acct.floatingProfit}, Realized ${acct.realizedProfit}, Total P/L ${acct.totalProfit}`
          : 'Account summary unavailable',
        `Open positions: ${running.stats.runningCount}, floating P/L ${running.stats.floatingProfit}`,
        `Open setups: ${terminal.stats.openSetupCount}, limits pending: ${terminal.stats.limitCount}`,
      ];
      if (running.trades.length) {
        lines.push(
          'Positions: ' +
            running.trades
              .map(
                (t) =>
                  `${t.symbol} ${t.direction} ${t.volume ?? '?'} lots P/L ${t.profit ?? 0}${t.signalId ? ` signal=${t.signalId}` : ''}`,
              )
              .join('; '),
        );
      }
      return lines.join('\n');
    } catch (err) {
      this.logger.warn(
        `Context snapshot failed: ${err instanceof Error ? err.message : err}`,
      );
      return 'Could not load live snapshot — use tools to fetch state.';
    }
  }

  private async callDeepSeek(messages: ChatMessage[]) {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools: MT5_TOOLS,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`DeepSeek MT5 assistant failed: ${err.slice(0, 300)}`);
      throw new ServiceUnavailableException('AI assistant temporarily unavailable');
    }

    return res.json() as Promise<{
      choices?: {
        message?: ChatMessage & { tool_calls?: ToolCall[] };
        finish_reason?: string;
      }[];
    }>;
  }

  private requireConfirmed(
    name: string,
    args: Record<string, unknown>,
  ): string | null {
    if (!EXECUTE_TOOLS.has(name)) return null;
    if (args.confirmed === true) return null;
    return `User confirmation required before ${name}. Ask them to confirm, then retry with confirmed: true.`;
  }

  private async runTool(
    userId: string,
    name: string,
    rawArgs: string,
  ): Promise<{ result: Record<string, unknown>; actionLabel?: string }> {
    let args: Record<string, unknown> = {};
    try {
      args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
    } catch {
      return {
        result: { ok: false, error: 'Invalid tool arguments JSON' },
      };
    }

    const confirmBlock = this.requireConfirmed(name, args);
    if (confirmBlock) {
      return { result: { ok: false, error: confirmBlock } };
    }

    try {
      switch (name) {
        case 'get_running_trades': {
          const data = await this.signals.getUserMt5RunningTrades(userId);
          return { result: { ...data } as Record<string, unknown> };
        }
        case 'get_open_setups': {
          const data = await this.signals.getOpenSignalsWithResolution(userId);
          return { result: { ...data } as Record<string, unknown> };
        }
        case 'get_quotes': {
          const data = await this.signals.getUserMt5Quotes(userId);
          return { result: { ...data } as Record<string, unknown> };
        }
        case 'get_mt5_terminal': {
          const data = await this.signals.getUserMt5Terminal(userId);
          return { result: { ...data } as Record<string, unknown> };
        }
        case 'get_setup_details': {
          const signalId = String(args.signal_id ?? '');
          if (!signalId) throw new BadRequestException('signal_id required');
          const resolution = await this.signals.getSetupResolution(
            userId,
            signalId,
          );
          return { result: { resolution } as Record<string, unknown> };
        }
        case 'place_trade': {
          const signalId = String(args.signal_id ?? '');
          const data = await this.signals.placeTrade(userId, signalId);
          return {
            result: { ...data } as Record<string, unknown>,
            actionLabel: `Placed trade for ${signalId.slice(0, 8)}`,
          };
        }
        case 'close_trade': {
          const signalId = String(args.signal_id ?? '');
          const data = await this.signals.closeSetupTrade(userId, signalId);
          return {
            result: { ...data } as Record<string, unknown>,
            actionLabel: `Closed setup ${signalId.slice(0, 8)}`,
          };
        }
        case 'close_all_trades': {
          const data = await this.signals.closeAllUserMt5Positions(userId);
          return {
            result: { ...data } as Record<string, unknown>,
            actionLabel: `Closed all (${data.closed} ok, ${data.failed} failed)`,
          };
        }
        case 'set_breakeven': {
          const signalId = String(args.signal_id ?? '');
          const data = await this.signals.setBreakeven(userId, signalId);
          return {
            result: { ...data } as Record<string, unknown>,
            actionLabel: `Breakeven on ${signalId.slice(0, 8)}`,
          };
        }
        case 'partial_close': {
          const signalId = String(args.signal_id ?? '');
          const volume = Number(args.volume);
          const data = await this.signals.partialCloseSetupTrade(
            userId,
            signalId,
            volume,
          );
          return {
            result: { ...data } as Record<string, unknown>,
            actionLabel: `Partial ${volume} on ${signalId.slice(0, 8)}`,
          };
        }
        case 'update_stops': {
          const signalId = String(args.signal_id ?? '');
          const dto: { stopLoss?: number; takeProfit?: number } = {};
          if (args.stop_loss !== undefined) dto.stopLoss = Number(args.stop_loss);
          if (args.take_profit !== undefined) {
            dto.takeProfit = Number(args.take_profit);
          }
          if (dto.stopLoss === undefined && dto.takeProfit === undefined) {
            throw new BadRequestException('stop_loss or take_profit required');
          }
          const data = await this.signals.updateSetupStops(
            userId,
            signalId,
            dto,
          );
          return {
            result: { ...data } as Record<string, unknown>,
            actionLabel: `Updated stops on ${signalId.slice(0, 8)}`,
          };
        }
        case 'invalidate_setup': {
          const signalId = String(args.signal_id ?? '');
          const reason =
            typeof args.reason === 'string' ? args.reason : undefined;
          const data = await this.signals.invalidateSetup(
            userId,
            signalId,
            reason,
          );
          return {
            result: { ...data } as Record<string, unknown>,
            actionLabel: `Invalidated ${signalId.slice(0, 8)}`,
          };
        }
        case 'close_position': {
          const positionId = String(args.position_id ?? '');
          const data = await this.signals.closeUserMetaApiPosition(
            userId,
            positionId,
          );
          return {
            result: { ...data } as Record<string, unknown>,
            actionLabel: `Closed position ${positionId}`,
          };
        }
        default:
          return { result: { ok: false, error: `Unknown tool: ${name}` } };
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Tool execution failed';
      return { result: { ok: false, error: msg, tool: name } };
    }
  }
}
