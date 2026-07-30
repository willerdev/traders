import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards';
import { CashAgentsService } from './cash-agents.service';
import { AgentSessionGuard } from './agent-session.guard';

@Controller('agents')
export class CashAgentsController {
  constructor(private agents: CashAgentsService) {}

  /** Public: apply to become a cash agent. */
  @Post('apply')
  apply(
    @Body()
    body: {
      displayName?: string;
      phone?: string;
      email?: string;
      note?: string;
    },
  ) {
    return this.agents.apply({
      displayName: body.displayName ?? '',
      phone: body.phone,
      email: body.email,
      note: body.note,
    });
  }

  /** Logged-in apply — links application to the user account. */
  @Post('apply/me')
  @UseGuards(JwtAuthGuard)
  applyMe(
    @Request() req: { user: { id: string; email?: string | null } },
    @Body()
    body: {
      displayName?: string;
      phone?: string;
      email?: string;
      note?: string;
    },
  ) {
    return this.agents.apply({
      displayName: body.displayName ?? '',
      phone: body.phone,
      email: body.email ?? req.user.email ?? undefined,
      note: body.note,
      userId: req.user.id,
    });
  }

  /** Public: unlock agent portal with access code. */
  @Post('session')
  openSession(@Body() body: { code?: string }) {
    return this.agents.openSession(body.code ?? '');
  }

  @Get('me')
  @UseGuards(AgentSessionGuard)
  me(@Request() req: { agent: { id: string } }) {
    return this.agents.me(req.agent.id);
  }

  @Get('momo-p2p')
  @UseGuards(AgentSessionGuard)
  listJobs(@Request() req: { agent: { id: string } }) {
    return this.agents.listOpenJobs(req.agent.id);
  }

  @Post('momo-p2p/:id/claim')
  @UseGuards(AgentSessionGuard)
  claim(
    @Request() req: { agent: { id: string } },
    @Param('id') id: string,
  ) {
    return this.agents.claimJob(req.agent.id, id);
  }

  @Post('momo-p2p/:id/confirm')
  @UseGuards(AgentSessionGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          cb(
            new BadRequestException('Only JPEG, PNG, and WebP images allowed'),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  confirm(
    @Request() req: { agent: { id: string } },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { proofUrl?: string },
  ) {
    return this.agents.confirmJob(req.agent.id, id, file, body.proofUrl);
  }
}
