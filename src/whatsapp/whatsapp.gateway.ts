import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  isLidUser,
  jidNormalizedUser,
} from '@whiskeysockets/baileys';
import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as qrcode from 'qrcode-terminal';
import { join } from 'path';
import { rmSync, existsSync } from 'fs';
import { ChatbotService } from '../chatbot/chatbot.service';

@Injectable()
export class WhatsappGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappGateway.name);
  private sock: WASocket | null = null;
  private shouldReconnect = true;

  /** QR string for web display */
  private currentQr: string | null = null;

  /** Track sent message IDs to prevent infinite loops */
  private readonly sentMessages = new Set<string>();

  private readonly authDir =
    process.env.AUTH_DIR || join(process.cwd(), 'auth_info');

  constructor(private readonly chatbotService: ChatbotService) {}

  async onModuleInit() {
    await this.connect();
  }

  onModuleDestroy() {
    this.shouldReconnect = false;
    this.sock?.end(undefined);
  }

  getQr(): string | null {
    return this.currentQr;
  }

  isConnected(): boolean {
    return this.sock !== null && this.currentQr === null;
  }

  /**
   * Wipe auth credentials and force a new QR scan.
   * Useful for Railway re-deploys or when you want to switch numbers.
   */
  async deleteSession(): Promise<void> {
    // Close current connection
    this.shouldReconnect = false;
    this.sock?.end(undefined);
    this.sock = null;
    this.currentQr = null;

    // Remove auth directory
    if (existsSync(this.authDir)) {
      rmSync(this.authDir, { recursive: true, force: true });
      this.logger.log(`Auth directory removed: ${this.authDir}`);
    }

    // Reconnect (will show new QR)
    this.shouldReconnect = true;
    await this.connect();
  }

  // -------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------

  private async connect() {
    const { version } = await fetchLatestBaileysVersion();
    this.logger.log(`Using Baileys version ${version.join('.')}`);
    this.logger.log(`Auth directory: ${this.authDir}`);

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      browser: ['Hueso Bot', 'Desktop', '1.0.0'],
    });

    this.sock.ev.on('creds.update', () => {
      void saveCreds();
    });

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.currentQr = qr;
        this.logger.log('QR code received — scan from /whatsapp or terminal:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        this.currentQr = null;
        this.logger.log('WhatsApp connection established');

        try {
          await this.sock!.sendPresenceUpdate('unavailable');
        } catch (err) {
          this.logger.warn('Failed to set presence unavailable', err);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output
          ?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          this.logger.warn(
            'Logged out from WhatsApp. Scan QR again after restarting.',
          );
          this.shouldReconnect = false;
          return;
        }

        this.logger.warn(
          `Connection closed (code=${statusCode}). Reconnecting...`,
        );

        if (this.shouldReconnect) {
          setTimeout(() => this.connect(), 3000);
        }
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      this.logger.debug(`messages.upsert type=${type} count=${messages.length}`);

      if (type !== 'notify') return;

      for (const msg of messages) {
        this.logger.debug(
          `Incoming: fromMe=${msg.key.fromMe} jid=${msg.key.remoteJid} id=${msg.key.id}`,
        );
        await this.handleIncomingMessage(msg);
      }
    });
  }

  // -------------------------------------------------------------------
  // LID → phone-number resolution (via Baileys signal store)
  // -------------------------------------------------------------------

  private async resolveJid(jid: string): Promise<string> {
    if (!isLidUser(jid)) return jid;

    try {
      const phoneJid =
        await this.sock?.signalRepository?.lidMapping?.getPNForLID(jid);
      if (phoneJid) {
        const normalized = jidNormalizedUser(phoneJid);
        this.logger.debug(`Resolved LID ${jid} → ${normalized}`);
        return normalized;
      }
    } catch (err) {
      this.logger.error(`Error resolving LID ${jid}`, err);
    }

    this.logger.warn(`Unresolved LID: ${jid} — phone number will be incorrect`);
    return jid;
  }

  // -------------------------------------------------------------------
  // Incoming message handling
  // -------------------------------------------------------------------

  private async handleIncomingMessage(msg: WAMessage) {
    if (!this.shouldProcessMessage(msg)) return;

    const remoteJid = msg.key.remoteJid!;
    const isGroup = remoteJid.endsWith('@g.us');

    // Resolve LID JIDs to phone-number JIDs for correct session tracking
    const sessionJid = isGroup
      ? await this.resolveJid(msg.key.participant ?? remoteJid)
      : await this.resolveJid(remoteJid);

    const text = this.extractText(msg);
    if (!text) return;

    this.logger.debug(
      `[${isGroup ? 'GROUP' : 'DM'}] ${sessionJid} → ${text}`,
    );

    const result = await this.chatbotService.handleMessage(sessionJid, text);

    // Silent ignore when no session found
    if (!result) return;

    // Send attachment first (e.g. PDF with caption), then text response
    if (result.attachment) {
      await this.sendDocument(
        remoteJid,
        result.attachment.buffer,
        result.attachment.mimetype,
        result.attachment.filename,
        result.attachment.caption,
      );
    }

    await this.sendMessage(remoteJid, result.response);
  }

  // -------------------------------------------------------------------
  // Message filtering
  // -------------------------------------------------------------------

  private shouldProcessMessage(msg: WAMessage): boolean {
    const messageObj = msg.message;
    if (!messageObj) return false;

    const remoteJid = msg.key.remoteJid;
    if (!remoteJid) return false;

    if (remoteJid === 'status@broadcast') return false;

    // Prevent processing messages we just sent (loop prevention)
    // This check is more reliable than fromMe because it tracks actual sent message IDs
    const messageId = msg.key.id;
    if (messageId && this.sentMessages.has(messageId)) return false;

    const hasText =
      ('conversation' in messageObj && messageObj.conversation) ||
      ('extendedTextMessage' in messageObj &&
        messageObj.extendedTextMessage?.text);

    if (!hasText) return false;

    return true;
  }

  // -------------------------------------------------------------------
  // Text extraction
  // -------------------------------------------------------------------

  private extractText(msg: WAMessage): string | null {
    const message = msg.message;
    if (!message) return null;

    const raw =
      message.conversation || message.extendedTextMessage?.text || null;

    if (!raw || !raw.trim()) return null;
    return raw.trim();
  }

  // -------------------------------------------------------------------
  // Send message (with loop-prevention tracking)
  // -------------------------------------------------------------------

  async sendMessage(jid: string, text: string) {
    if (!this.sock) {
      this.logger.warn('Cannot send message — socket not connected');
      return;
    }

    const result = await this.sock.sendMessage(jid, { text });

    this.trackSentMessage(result?.key?.id);
  }

  async sendDocument(
    jid: string,
    buffer: Buffer,
    mimetype: string,
    fileName: string,
    caption?: string,
  ) {
    if (!this.sock) {
      this.logger.warn('Cannot send document — socket not connected');
      return;
    }

    const result = await this.sock.sendMessage(jid, {
      document: buffer,
      mimetype,
      fileName,
      caption,
    });

    this.trackSentMessage(result?.key?.id);
  }

  private trackSentMessage(messageId: string | undefined | null) {
    if (!messageId) return;
    this.sentMessages.add(messageId);
    setTimeout(() => {
      this.sentMessages.delete(messageId);
    }, 30_000);
  }
}
