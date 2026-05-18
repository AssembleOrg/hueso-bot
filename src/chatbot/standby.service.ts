import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';

const BACKEND_BASE =
  process.env.HUESO_BACKEND_URL ||
  'https://hueso-backend-production.up.railway.app/api';

const SEND_MESSAGE_PASSWORD = process.env.SEND_MESSAGE_PASSWORD || '';

// Cache del último estado conocido por jid. Si el backend cae, isActive
// usa este valor (si es fresco) en lugar de fallar abierto a todo el mundo.
const STATE_CACHE_TTL_MS = 2 * 60 * 1000;

// Throttle de logs por jid: si el backend está caído y llegan muchos
// mensajes, no spammeamos un log por cada uno.
const LOG_THROTTLE_MS = 60 * 1000;

// Cleanup periódico de las Maps en memoria. Cada N minutos barremos
// entradas vencidas para que el footprint no crezca con la cardinalidad
// histórica de jids (un cliente que escribió una vez nunca más vuelve).
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

interface StatusResponse {
  active: boolean;
  expiresAt: string | null;
  reason: string | null;
}

/**
 * El backend envuelve todas las respuestas con un ResponseInterceptor global:
 * `{ ok: true, data: T, meta: {...} }`. Hay que leer `.data` del envelope.
 */
interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  meta?: { requestId?: string };
}

@Injectable()
export class StandbyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StandbyService.name);
  private readonly stateCache = new Map<string, { active: boolean; cachedAt: number }>();
  private readonly lastLogAt = new Map<string, number>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  onModuleInit() {
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let removedCache = 0;
    let removedLogs = 0;

    for (const [jid, entry] of this.stateCache) {
      if (now - entry.cachedAt > STATE_CACHE_TTL_MS) {
        this.stateCache.delete(jid);
        removedCache++;
      }
    }

    for (const [jid, ts] of this.lastLogAt) {
      if (now - ts > LOG_THROTTLE_MS) {
        this.lastLogAt.delete(jid);
        removedLogs++;
      }
    }

    if (removedCache > 0 || removedLogs > 0) {
      this.logger.debug(
        `StandbyService cleanup: stateCache=-${removedCache} (size=${this.stateCache.size}), lastLogAt=-${removedLogs} (size=${this.lastLogAt.size})`,
      );
    }
  }

  /**
   * Devuelve si el jid está en standby.
   *
   * Si el backend responde OK, refresca el cache y devuelve el valor real.
   * Si el backend falla (no-ok o excepción) y tenemos un valor cacheado
   * reciente (< 2min), devuelve el cache — así un outage corto no expone a
   * clientes delegados al rep al menú del bot. Si no hay cache fresco,
   * falla abierto (false) para no bloquear el resto del tráfico.
   */
  async isActive(jid: string): Promise<boolean> {
    try {
      const res = await fetch(
        `${BACKEND_BASE}/public/whatsapp-standby/${encodeURIComponent(jid)}`,
      );
      if (!res.ok) {
        this.throttledWarn(jid, `Standby check HTTP ${res.status} for ${jid}`);
        return this.fallbackFromCache(jid);
      }
      const envelope = (await res.json()) as ApiEnvelope<StatusResponse>;
      const active = envelope.data?.active === true;
      this.stateCache.set(jid, { active, cachedAt: Date.now() });
      this.logger.log(`isActive(${jid}) → ${active}`);
      return active;
    } catch (err) {
      this.throttledError(jid, `Standby check failed for ${jid}`, err);
      return this.fallbackFromCache(jid);
    }
  }

  async start(jid: string, ttlSeconds: number, reason?: string): Promise<boolean> {
    try {
      const res = await fetch(`${BACKEND_BASE}/public/whatsapp-standby`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: SEND_MESSAGE_PASSWORD,
          jid,
          ttlSeconds,
          reason,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`Standby start failed ${res.status}: ${body}`);
        return false;
      }
      // Optimistic cache update — el bot ya sabe que arrancó standby.
      this.stateCache.set(jid, { active: true, cachedAt: Date.now() });
      this.logger.log(`Standby start OK jid=${jid} ttl=${ttlSeconds}s`);
      return true;
    } catch (err) {
      this.logger.error(`Standby start error for ${jid}`, err);
      return false;
    }
  }

  /**
   * Registra un mensaje observado durante standby. Si el sender alterna respecto
   * del último (ida y vuelta cliente↔rep), el backend acumula crédito de +15min
   * que se consume al expirar el bloque vigente. Fire-and-forget desde el bot.
   */
  async touch(jid: string, fromMe: boolean): Promise<void> {
    try {
      const res = await fetch(
        `${BACKEND_BASE}/public/whatsapp-standby/${encodeURIComponent(jid)}/touch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password: SEND_MESSAGE_PASSWORD,
            fromMe,
          }),
        },
      );
      if (!res.ok) {
        this.throttledWarn(jid, `Standby touch HTTP ${res.status} for ${jid}`);
      }
    } catch (err) {
      this.throttledError(jid, `Standby touch error for ${jid}`, err);
    }
  }

  private fallbackFromCache(jid: string): boolean {
    const cached = this.stateCache.get(jid);
    if (cached && Date.now() - cached.cachedAt < STATE_CACHE_TTL_MS) {
      return cached.active;
    }
    return false;
  }

  private shouldLog(jid: string): boolean {
    const now = Date.now();
    const last = this.lastLogAt.get(jid) ?? 0;
    if (now - last < LOG_THROTTLE_MS) return false;
    this.lastLogAt.set(jid, now);
    return true;
  }

  private throttledWarn(jid: string, msg: string): void {
    if (this.shouldLog(jid)) this.logger.warn(msg);
  }

  private throttledError(jid: string, msg: string, err: unknown): void {
    if (this.shouldLog(jid)) this.logger.error(msg, err);
  }
}
