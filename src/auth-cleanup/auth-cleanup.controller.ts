import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthCleanupService } from './auth-cleanup.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthCleanupController {
  constructor(private readonly authCleanupService: AuthCleanupService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Estadísticas del directorio auth_info' })
  getStats() {
    return this.authCleanupService.getStats();
  }
}
