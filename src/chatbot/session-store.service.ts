import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Database from 'better-sqlite3';
import { SessionState, UserSession } from './session.interface';
import { SESSION_TTL_MS, CLEANUP_INTERVAL_MS } from './chatbot.constants';

@Injectable()
export class SessionStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionStoreService.name);
  private db: Database.Database;
  private cleanupTimer: ReturnType<typeof setInterval>;

  onModuleInit() {
    this.db = new Database(':memory:');
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        jid TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        last_interaction_at INTEGER NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}'
      )
    `);

    this.cleanupTimer = setInterval(
      () => this.cleanupExpired(),
      CLEANUP_INTERVAL_MS,
    );

    this.logger.log('SQLite in-memory session store initialized');
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
    this.db.close();
    this.logger.log('SQLite session store closed');
  }

  get(jid: string): UserSession | null {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE jid = ?')
      .get(jid) as any;

    if (!row) return null;

    const now = Date.now();
    if (now - row.last_interaction_at > SESSION_TTL_MS) {
      this.delete(jid);
      return null;
    }

    return {
      jid: row.jid,
      state: row.state as SessionState,
      lastInteractionAt: new Date(row.last_interaction_at),
      metadata: JSON.parse(row.metadata),
    };
  }

  upsert(session: UserSession): void {
    this.db
      .prepare(
        `INSERT INTO sessions (jid, state, last_interaction_at, metadata)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(jid) DO UPDATE SET
           state = excluded.state,
           last_interaction_at = excluded.last_interaction_at,
           metadata = excluded.metadata`,
      )
      .run(
        session.jid,
        session.state,
        session.lastInteractionAt.getTime(),
        JSON.stringify(session.metadata),
      );
  }

  delete(jid: string): void {
    this.db.prepare('DELETE FROM sessions WHERE jid = ?').run(jid);
  }

  private cleanupExpired(): void {
    const cutoff = Date.now() - SESSION_TTL_MS;
    const result = this.db
      .prepare('DELETE FROM sessions WHERE last_interaction_at < ?')
      .run(cutoff);

    if (result.changes > 0) {
      this.logger.log(`Cleaned up ${result.changes} expired session(s)`);
    }
  }
}
