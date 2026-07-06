import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetaApiAccount, MetaApiService } from '../metaapi/metaapi.service';
import { humanizeBrokerError } from '../common/broker-error.util';

export type LinkableMt5Account = MetaApiAccount & {
  assignedToYou: boolean;
  available: boolean;
};

@Injectable()
export class Mt5PoolService {
  private readonly logger = new Logger(Mt5PoolService.name);

  constructor(
    private prisma: PrismaService,
    private metaApi: MetaApiService,
  ) {}

  private reservedAccountIds(): Set<string> {
    const ids = [
      this.metaApi.getConfiguredDefaultAccountId(),
      this.metaApi.getConfiguredCopyAccountId(),
    ].filter((id): id is string => Boolean(id?.trim()));
    return new Set(ids);
  }

  private async loadPoolAccounts(): Promise<MetaApiAccount[]> {
    if (!this.metaApi.isConfigured) return [];

    let result = await this.metaApi.listAccounts({
      limit: 100,
      deploymentStatus: 'deployed',
    });
    if (result.items.length === 0) {
      result = await this.metaApi.listAccounts({ limit: 100 });
    }
    return result.items;
  }

  private async assignedAccountMap(excludeUserId?: string) {
    const rows = await this.prisma.user.findMany({
      where: { metaApiAccountId: { not: null } },
      select: { id: true, metaApiAccountId: true },
    });
    const map = new Map<string, string>();
    for (const row of rows) {
      const id = row.metaApiAccountId?.trim();
      if (!id) continue;
      if (excludeUserId && row.id === excludeUserId) continue;
      map.set(id, row.id);
    }
    return map;
  }

  async listLinkableAccounts(userId: string) {
    if (!this.metaApi.isConfigured) {
      return { configured: false, count: 0, items: [] as LinkableMt5Account[] };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { metaApiAccountId: true },
    });
    const reserved = this.reservedAccountIds();
    const assigned = await this.assignedAccountMap(userId);
    const accounts = await this.loadPoolAccounts();

    const items: LinkableMt5Account[] = accounts
      .filter((account) => !reserved.has(account.id))
      .map((account) => {
        const assignedToOther = assigned.has(account.id);
        const assignedToYou = user?.metaApiAccountId === account.id;
        return {
          ...account,
          assignedToYou,
          available: assignedToYou || !assignedToOther,
        };
      })
      .filter((account) => account.available)
      .sort((a, b) => {
        const rank = (account: MetaApiAccount) =>
          account.connectionStatus === 'CONNECTED'
            ? 0
            : account.connectionStatus === 'DISCONNECTED'
              ? 2
              : 1;
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });

    return { configured: true, count: items.length, items };
  }

  private isStaleMetaApiAccountError(err: unknown): boolean {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
      /validation failed/i.test(msg) ||
      /not found/i.test(msg) ||
      /does not exist/i.test(msg) ||
      /account lookup failed \(404\)/i.test(msg)
    );
  }

  private claimErrorMessage(err: unknown, fallback: string): string {
    const raw = err instanceof Error ? err.message : String(err);
    if (/validation failed/i.test(raw)) {
      return 'That MT5 account is no longer available in MetaAPI. We tried to assign another from the pool — if this keeps happening, contact support.';
    }
    if (/no mt5 pool accounts are available/i.test(raw)) {
      return raw;
    }
    return humanizeBrokerError(raw, fallback);
  }

  async claimAccount(userId: string) {
    if (!this.metaApi.isConfigured) {
      throw new ServiceUnavailableException(
        'Live MT5 linking is not configured on the platform yet',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { metaApiAccountId: true, displayName: true },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.metaApiAccountId?.trim()) {
      const linkedId = user.metaApiAccountId.trim();
      try {
        const existing = await this.metaApi.getAccount(linkedId);
        return {
          alreadyLinked: true,
          accountId: existing.id,
          account: existing,
        };
      } catch (err) {
        if (!this.isStaleMetaApiAccountError(err)) {
          throw new BadRequestException(
            this.claimErrorMessage(
              err,
              'Could not verify your linked MT5 account. Please try again shortly.',
            ),
          );
        }
        this.logger.warn(
          `Clearing stale MT5 link ${linkedId} for user ${userId}`,
        );
        await this.prisma.user.update({
          where: { id: userId },
          data: { metaApiAccountId: null },
        });
      }
    }

    const linkable = await this.listLinkableAccounts(userId);
    const candidates = linkable.items.filter((row) => row.available);
    if (candidates.length === 0) {
      throw new BadRequestException(
        'No MT5 pool accounts are available right now. Please try again later or contact support.',
      );
    }

    let lastError: unknown = null;
    for (const pick of candidates) {
      try {
        const account = await this.metaApi.getAccount(pick.id);
        await this.prisma.user.update({
          where: { id: userId },
          data: { metaApiAccountId: pick.id },
        });

        this.logger.log(
          `Assigned MT5 pool account ${pick.id} (${pick.login}@${pick.server}) to ${user.displayName}`,
        );

        return {
          alreadyLinked: false,
          accountId: pick.id,
          account,
        };
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `Pool account ${pick.id} unavailable for ${user.displayName}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    throw new BadRequestException(
      this.claimErrorMessage(
        lastError,
        'Could not connect an MT5 account right now. Please try again shortly.',
      ),
    );
  }

  async assertAccountLinkable(userId: string, accountId: string) {
    const reserved = this.reservedAccountIds();
    if (reserved.has(accountId)) {
      throw new BadRequestException(
        'That account is reserved for platform trading and cannot be linked personally',
      );
    }

    const assigned = await this.assignedAccountMap(userId);
    const owner = assigned.get(accountId);
    if (owner && owner !== userId) {
      throw new BadRequestException(
        'That MT5 account is already linked to another trader',
      );
    }
  }
}
