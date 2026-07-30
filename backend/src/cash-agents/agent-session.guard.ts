import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CashAgentsService } from './cash-agents.service';
import { AGENT_SESSION_HEADER } from './agent.constants';

@Injectable()
export class AgentSessionGuard implements CanActivate {
  constructor(private agents: CashAgentsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      agent?: { id: string; displayName: string };
    }>();
    const raw = req.headers[AGENT_SESSION_HEADER];
    const token = Array.isArray(raw) ? raw[0] : raw;
    try {
      const agent = await this.agents.resolveSession(token);
      req.agent = { id: agent.id, displayName: agent.displayName };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Agent session required');
    }
  }
}
