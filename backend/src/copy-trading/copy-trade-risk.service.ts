import { BadRequestException, Injectable } from '@nestjs/common';
import { TradeDirection } from '@prisma/client';
import {
  MetaApiAccount,
  MetaApiService,
  MetaApiSymbolPrice,
  MetaApiSymbolSpec,
} from '../metaapi/metaapi.service';

export type CopyTradeRiskInput = {
  account: MetaApiAccount;
  symbol: string;
  direction: TradeDirection;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskPercent: number;
};

export type CopyTradeRiskResult = {
  volume: number;
  riskPercent: number;
  riskCapAmount: number;
  estimatedLossAtSl: number;
  accountEquity: number;
  accountBalance: number;
  currency: string;
  stopLoss: number;
  takeProfit: number;
  slDistance: number;
  slDistancePips: number;
  pairAdjustments: string[];
};

@Injectable()
export class CopyTradeRiskService {
  constructor(private metaApi: MetaApiService) {}

  private volumeDecimals(step: number): number {
    const s = String(step);
    const dot = s.indexOf('.');
    return dot === -1 ? 0 : s.length - dot - 1;
  }

  private roundVolumeDown(
    volume: number,
    step: number,
    min: number,
    max: number,
  ): number | null {
    if (step <= 0) return null;
    const decimals = this.volumeDecimals(step);
    const steps = Math.floor(volume / step + 1e-9);
    let v = steps * step;
    if (v < min) return null;
    if (v > max) v = max;
    return Number(v.toFixed(decimals));
  }

  private riskPerLot(
    slDistance: number,
    spec: MetaApiSymbolSpec,
    price?: MetaApiSymbolPrice,
  ): number {
    const tickSize = spec.tickSize > 0 ? spec.tickSize : 0.00001;
    const ticks = slDistance / tickSize;
    const lossTick = Number(price?.lossTickValue ?? 0);
    if (lossTick > 0 && Number.isFinite(ticks)) {
      return ticks * lossTick;
    }
    const contractSize = spec.contractSize > 0 ? spec.contractSize : 100_000;
    return slDistance * contractSize;
  }

  private pipSize(spec: MetaApiSymbolSpec): number {
    const digits = spec.digits ?? 5;
    if (digits === 3 || digits === 5) {
      return Math.pow(10, -(digits - 1));
    }
    return spec.tickSize > 0 ? spec.tickSize : Math.pow(10, -digits);
  }

  private validateLevels(
    direction: TradeDirection,
    entryPrice: number,
    stopLoss: number,
    takeProfit: number,
  ) {
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      throw new BadRequestException('Invalid entry price for copy trade sizing');
    }
    if (stopLoss === entryPrice) {
      throw new BadRequestException(
        'Stop loss must differ from entry — cannot size copy trade',
      );
    }
    if (direction === 'BUY') {
      if (stopLoss >= entryPrice) {
        throw new BadRequestException(
          'BUY copy trade requires stop loss below entry',
        );
      }
      if (takeProfit <= entryPrice) {
        throw new BadRequestException(
          'BUY copy trade requires take profit above entry',
        );
      }
    } else {
      if (stopLoss <= entryPrice) {
        throw new BadRequestException(
          'SELL copy trade requires stop loss above entry',
        );
      }
      if (takeProfit >= entryPrice) {
        throw new BadRequestException(
          'SELL copy trade requires take profit below entry',
        );
      }
    }
  }

  private pairAdjustments(
    spec: MetaApiSymbolSpec,
    price: MetaApiSymbolPrice,
    slDistance: number,
    slDistancePips: number,
  ): string[] {
    const notes: string[] = [];
    notes.push(
      `Symbol ${spec.symbol}: contract ${spec.contractSize}, tick ${spec.tickSize}, step ${spec.volumeStep}`,
    );
    if (price.lossTickValue != null && price.lossTickValue > 0) {
      notes.push(`Using broker loss tick value ${price.lossTickValue}`);
    } else {
      notes.push('Using contract-size fallback for per-lot risk');
    }
    notes.push(`SL distance ${slDistance.toFixed(spec.digits ?? 5)} (${slDistancePips.toFixed(1)} pips)`);
    return notes;
  }

  /**
   * Sizes exactly one copy trade lot so estimated SL loss never exceeds riskPercent of equity.
   * Volume is rounded down to broker step to stay under the cap.
   */
  async calculateCopyPositionSize(
    input: CopyTradeRiskInput,
  ): Promise<CopyTradeRiskResult> {
    if (input.riskPercent <= 0 || input.riskPercent > 100) {
      throw new BadRequestException('Copy risk percent must be between 0 and 100');
    }

    this.validateLevels(
      input.direction,
      input.entryPrice,
      input.stopLoss,
      input.takeProfit,
    );

    const account = await this.metaApi.ensureAccountReady(input.account.id);
    const [accountInfo, spec, price] = await Promise.all([
      this.metaApi.getAccountInformation(account),
      this.metaApi.getSymbolSpecification(account, input.symbol),
      this.metaApi.getSymbolPrice(account, input.symbol),
    ]);

    if (!accountInfo.tradeAllowed) {
      throw new BadRequestException('Copy account trading is not allowed');
    }

    const balance = Number(accountInfo.balance ?? 0);
    const reportedEquity = Number(accountInfo.equity ?? 0);
    const equity = Math.max(
      reportedEquity > 0 ? reportedEquity : 0,
      balance > 0 ? balance : 0,
    );
    const riskCapAmount = equity * (input.riskPercent / 100);
    if (riskCapAmount <= 0) {
      throw new BadRequestException(
        `Copy account equity is too low to size a trade (balance ${balance.toFixed(2)}, equity ${reportedEquity.toFixed(2)} ${accountInfo.currency})`,
      );
    }

    const slDistance = Math.abs(input.entryPrice - input.stopLoss);
    const pip = this.pipSize(spec);
    const slDistancePips = pip > 0 ? slDistance / pip : 0;
    const minTicks = Math.max(5, (spec.digits ?? 5) >= 3 ? 10 : 5);
    const minSlDistance = (spec.tickSize > 0 ? spec.tickSize : pip) * minTicks;
    if (slDistance < minSlDistance) {
      throw new BadRequestException(
        `Stop loss too close to entry for ${spec.symbol} — would exceed ${input.riskPercent}% risk cap at minimum volume`,
      );
    }

    const perLot = this.riskPerLot(slDistance, spec, price);
    if (perLot <= 0) {
      throw new BadRequestException(
        `Cannot estimate risk per lot for ${spec.symbol}`,
      );
    }

    const rawVolume = riskCapAmount / perLot;
    let volume = this.roundVolumeDown(
      rawVolume,
      spec.volumeStep,
      spec.minVolume,
      spec.maxVolume,
    );

    let estimatedLossAtSl = 0;
    let usedMinLotOverride = false;
    if (volume == null) {
      if (spec.minVolume > 0 && equity > 0) {
        volume = spec.minVolume;
        estimatedLossAtSl = volume * perLot;
        usedMinLotOverride = true;
      } else {
        throw new BadRequestException(
          `Minimum lot ${spec.minVolume} on ${spec.symbol} would risk more than ${input.riskPercent}% — copy skipped`,
        );
      }
    } else {
      estimatedLossAtSl = volume * perLot;
      while (
        estimatedLossAtSl > riskCapAmount &&
        volume > spec.minVolume
      ) {
        const next = this.roundVolumeDown(
          volume - spec.volumeStep,
          spec.volumeStep,
          spec.minVolume,
          spec.maxVolume,
        );
        if (next == null || next >= volume) break;
        volume = next;
        estimatedLossAtSl = volume * perLot;
      }

      if (estimatedLossAtSl > riskCapAmount * 1.002) {
        throw new BadRequestException(
          `Could not size ${spec.symbol} within ${input.riskPercent}% risk cap (est. loss ${estimatedLossAtSl.toFixed(2)} ${accountInfo.currency})`,
        );
      }
    }

    const pairNotes = this.pairAdjustments(
      spec,
      price,
      slDistance,
      slDistancePips,
    );
    if (usedMinLotOverride) {
      pairNotes.push(
        `Using broker minimum ${volume} lots — exceeds ${input.riskPercent}% cap (${riskCapAmount.toFixed(2)} ${accountInfo.currency}); est. loss ${estimatedLossAtSl.toFixed(2)}`,
      );
    }
    pairNotes.push(
      `Capped at ${input.riskPercent}% = ${riskCapAmount.toFixed(2)} ${accountInfo.currency}; ${volume} lots est. loss ${estimatedLossAtSl.toFixed(2)}`,
    );

    return {
      volume,
      riskPercent: input.riskPercent,
      riskCapAmount,
      estimatedLossAtSl,
      accountEquity: equity,
      accountBalance: accountInfo.balance,
      currency: accountInfo.currency,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      slDistance,
      slDistancePips,
      pairAdjustments: pairNotes,
    };
  }
}
