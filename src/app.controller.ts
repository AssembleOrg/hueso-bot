import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check básico' })
  getRoot() {
    return { status: 'ok' };
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check con timestamp' })
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ping')
  @ApiOperation({ summary: 'Keep-alive endpoint' })
  getPing() {
    return { pong: true, timestamp: new Date().toISOString() };
  }
}
