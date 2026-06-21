import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaveSignalDraftDto } from '../common/dto';

@Injectable()
export class SignalDraftsService {
  constructor(private prisma: PrismaService) {}

  calculateProgress(dto: SaveSignalDraftDto): number {
    const fields = [
      dto.symbol?.trim(),
      dto.direction,
      dto.entryMin,
      dto.entryMax,
      dto.stopLoss,
      dto.takeProfit,
      dto.description?.trim(),
      dto.screenshotUrl?.trim(),
    ];

    const filled = fields.filter((value) => {
      if (value === undefined || value === null) return false;
      if (typeof value === 'string') return value.length > 0;
      return true;
    }).length;

    return Math.round((filled / fields.length) * 100);
  }

  private hasContent(dto: SaveSignalDraftDto): boolean {
    return this.calculateProgress(dto) > 0;
  }

  async list(userId: string) {
    return this.prisma.signalDraft.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(userId: string, draftId: string) {
    const draft = await this.prisma.signalDraft.findFirst({
      where: { id: draftId, userId },
    });

    if (!draft) {
      throw new NotFoundException('Draft not found');
    }

    return draft;
  }

  async create(userId: string, dto: SaveSignalDraftDto) {
    if (!this.hasContent(dto)) {
      throw new BadRequestException('Draft has no content to save');
    }

    return this.prisma.signalDraft.create({
      data: {
        userId,
        symbol: dto.symbol?.trim().toUpperCase() || null,
        direction: dto.direction || null,
        entryMin: dto.entryMin ?? null,
        entryMax: dto.entryMax ?? null,
        stopLoss: dto.stopLoss ?? null,
        takeProfit: dto.takeProfit ?? null,
        description: dto.description?.trim() || null,
        screenshotUrl: dto.screenshotUrl || null,
        aiFilled: dto.aiFilled ?? false,
        progress: this.calculateProgress(dto),
      },
    });
  }

  async update(userId: string, draftId: string, dto: SaveSignalDraftDto) {
    await this.get(userId, draftId);

    if (!this.hasContent(dto)) {
      throw new BadRequestException('Draft has no content to save');
    }

    return this.prisma.signalDraft.update({
      where: { id: draftId },
      data: {
        symbol: dto.symbol?.trim().toUpperCase() || null,
        direction: dto.direction || null,
        entryMin: dto.entryMin ?? null,
        entryMax: dto.entryMax ?? null,
        stopLoss: dto.stopLoss ?? null,
        takeProfit: dto.takeProfit ?? null,
        description: dto.description?.trim() || null,
        screenshotUrl: dto.screenshotUrl || null,
        aiFilled: dto.aiFilled ?? false,
        progress: this.calculateProgress(dto),
      },
    });
  }

  async delete(userId: string, draftId: string) {
    await this.get(userId, draftId);
    await this.prisma.signalDraft.delete({ where: { id: draftId } });
    return { deleted: true };
  }
}
