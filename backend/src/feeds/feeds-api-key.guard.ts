import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class FeedsApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('SETUP_FEED_API_KEY')?.trim();
    if (!expected) {
      throw new ServiceUnavailableException(
        'SETUP_FEED_API_KEY is not configured on the server',
      );
    }

    const req = context.switchToHttp().getRequest<Request>();
    const headerKey = req.headers['x-api-key'];
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    const queryKey =
      typeof req.query.api_key === 'string' ? req.query.api_key : undefined;

    const provided =
      (typeof headerKey === 'string' ? headerKey : undefined) ||
      bearer ||
      queryKey;

    if (!provided || provided !== expected) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}
