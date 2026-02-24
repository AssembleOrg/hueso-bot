import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KeepAliveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KeepAliveService.name);
  private intervalRef: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const isProduction = this.config.get('NODE_ENV') === 'production';
    const keepAliveUrl = this.config.get<string>('KEEP_ALIVE_URL');

    if (!isProduction || !keepAliveUrl) {
      this.logger.log(
        'Keep-alive disabled (NODE_ENV !== production or KEEP_ALIVE_URL not set)',
      );
      return;
    }

    const intervalMinutes = parseInt(
      this.config.get('KEEP_ALIVE_INTERVAL') || '5',
      10,
    );
    const intervalMs = intervalMinutes * 60 * 1000;

    this.logger.log(
      `Keep-alive enabled: pinging ${keepAliveUrl} every ${intervalMinutes}m`,
    );

    this.intervalRef = setInterval(() => {
      void this.ping(keepAliveUrl);
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }

  private async ping(url: string) {
    try {
      const res = await fetch(url);
      this.logger.debug(`Keep-alive ping → ${res.status}`);
    } catch (err) {
      this.logger.warn(`Keep-alive ping failed: ${err}`);
    }
  }
}
