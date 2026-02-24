import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readdirSync, statSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

export interface AuthStats {
  totalSizeMB: number;
  preKeyCount: number;
  fileCount: number;
  maxPreKeys: number;
  maxDirSizeMB: number;
}

@Injectable()
export class AuthCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthCleanupService.name);
  private intervalRef: ReturnType<typeof setInterval> | null = null;

  private readonly authDir: string;
  private readonly maxPreKeys: number;
  private readonly maxDirSizeMB: number;

  constructor(private readonly config: ConfigService) {
    this.authDir =
      this.config.get<string>('AUTH_DIR') || join(process.cwd(), 'auth_info');
    this.maxPreKeys = parseInt(
      this.config.get('MAX_PRE_KEYS') || '100',
      10,
    );
    this.maxDirSizeMB = parseInt(
      this.config.get('MAX_AUTH_DIR_SIZE_MB') || '50',
      10,
    );
  }

  onModuleInit() {
    // Run cleanup immediately on startup
    this.cleanup();

    const intervalHours = parseInt(
      this.config.get('AUTH_CLEANUP_INTERVAL_HOURS') || '72',
      10,
    );
    const intervalMs = intervalHours * 60 * 60 * 1000;

    this.logger.log(
      `Auth cleanup scheduled every ${intervalHours}h (maxPreKeys=${this.maxPreKeys}, maxDirSize=${this.maxDirSizeMB}MB)`,
    );

    this.intervalRef = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }

  getStats(): AuthStats {
    if (!existsSync(this.authDir)) {
      return {
        totalSizeMB: 0,
        preKeyCount: 0,
        fileCount: 0,
        maxPreKeys: this.maxPreKeys,
        maxDirSizeMB: this.maxDirSizeMB,
      };
    }

    const files = readdirSync(this.authDir);
    const preKeys = files.filter((f) => f.startsWith('pre-key-'));
    let totalSize = 0;

    for (const file of files) {
      try {
        const stat = statSync(join(this.authDir, file));
        totalSize += stat.size;
      } catch {
        // file may have been deleted between readdir and stat
      }
    }

    return {
      totalSizeMB: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
      preKeyCount: preKeys.length,
      fileCount: files.length,
      maxPreKeys: this.maxPreKeys,
      maxDirSizeMB: this.maxDirSizeMB,
    };
  }

  private cleanup() {
    if (!existsSync(this.authDir)) {
      this.logger.debug('Auth directory does not exist, skipping cleanup');
      return;
    }

    const files = readdirSync(this.authDir);
    let removed = 0;

    // 1. Remove temp files (.tmp, .lock, temp-*)
    for (const file of files) {
      if (
        file.endsWith('.tmp') ||
        file.endsWith('.lock') ||
        file.startsWith('temp-')
      ) {
        try {
          unlinkSync(join(this.authDir, file));
          removed++;
        } catch {
          // ignore
        }
      }
    }

    // 2. Trim pre-keys if over limit
    const preKeys = files
      .filter((f) => f.startsWith('pre-key-'))
      .map((f) => ({
        name: f,
        num: parseInt(f.replace('pre-key-', '').replace('.json', ''), 10),
      }))
      .sort((a, b) => a.num - b.num);

    if (preKeys.length > this.maxPreKeys) {
      const toRemove = preKeys.slice(0, preKeys.length - this.maxPreKeys);
      for (const pk of toRemove) {
        try {
          unlinkSync(join(this.authDir, pk.name));
          removed++;
        } catch {
          // ignore
        }
      }
      this.logger.log(
        `Trimmed ${toRemove.length} old pre-keys (${preKeys.length} → ${this.maxPreKeys})`,
      );
    }

    // 3. Check total directory size
    const stats = this.getStats();
    if (stats.totalSizeMB > this.maxDirSizeMB) {
      this.logger.warn(
        `Auth directory size (${stats.totalSizeMB}MB) exceeds limit (${this.maxDirSizeMB}MB)`,
      );
    }

    if (removed > 0) {
      this.logger.log(`Auth cleanup: removed ${removed} files`);
    } else {
      this.logger.debug('Auth cleanup: nothing to remove');
    }
  }
}
