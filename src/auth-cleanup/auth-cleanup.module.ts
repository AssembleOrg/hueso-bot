import { Module } from '@nestjs/common';
import { AuthCleanupService } from './auth-cleanup.service';
import { AuthCleanupController } from './auth-cleanup.controller';

@Module({
  controllers: [AuthCleanupController],
  providers: [AuthCleanupService],
  exports: [AuthCleanupService],
})
export class AuthCleanupModule {}
