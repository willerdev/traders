import { Controller, Get } from '@nestjs/common';
import { isSoloApp } from '../common/app-variant';

@Controller('health')
export class HealthController {
  @Get()
  ping() {
    return {
      ok: true,
      variant: isSoloApp() ? 'solo' : 'traders',
      service: isSoloApp() ? 'solo-api' : 'traders-api',
    };
  }
}
