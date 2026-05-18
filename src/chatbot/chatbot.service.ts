import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { SessionStoreService } from './session-store.service';
import { StandbyService } from './standby.service';
import { SessionState, RouteResult } from './session.interface';
import { MESSAGES, STANDBY_TTL_SECONDS } from './chatbot.constants';
import { ProductsService } from '../products/products.service';
import { PdfService } from '../products/pdf.service';
import { PromosClientService } from '../products/promos-client.service';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    private readonly sessionStore: SessionStoreService,
    private readonly standbyService: StandbyService,
    private readonly productsService: ProductsService,
    private readonly pdfService: PdfService,
    private readonly promosClient: PromosClientService,
  ) {}

  async handleMessage(
    jid: string,
    rawText: string,
    fromMe = false,
  ): Promise<RouteResult | null> {
    const text = rawText.trim();
    const cmd = text.toLowerCase();

    // --- Standby gate: si el cliente está delegado a un humano, ignoramos
    // todos los mensajes. El touch registra el sender y suma crédito de +15min
    // si hay ida y vuelta (cap 4h, gestionado en backend).
    if (await this.standbyService.isActive(jid)) {
      void this.standbyService.touch(jid, fromMe);
      return null;
    }

    // Mensaje propio (dueño escribiendo manualmente desde otro device) sin
    // standby activo: ignoramos para no auto-disparar el menú con un mensaje
    // saliente.
    if (fromMe) {
      return null;
    }

    // --- Auto-start: cualquier mensaje del cliente sin sesión arranca el menú.
    let session = this.sessionStore.get(jid);
    if (!session) {
      return this.startSession(jid);
    }

    // Opción 9 — Finalizar (parte del menú, no es comando).
    if (cmd === '9') {
      this.sessionStore.delete(jid);
      return {
        response: MESSAGES.FAREWELL,
        newState: SessionState.PAUSED,
      };
    }

    session.lastInteractionAt = new Date();

    if (session.state === SessionState.MAIN_MENU) {
      return this.handleMainMenu(jid, cmd, session.metadata);
    }

    this.logger.warn(`Invalid state "${session.state}" for jid=${jid}`);
    return {
      response: MESSAGES.INVALID_STATE,
      newState: session.state,
    };
  }

  private startSession(jid: string): RouteResult {
    this.sessionStore.upsert({
      jid,
      state: SessionState.MAIN_MENU,
      lastInteractionAt: new Date(),
      metadata: {},
    });

    return {
      response: MESSAGES.MAIN_MENU,
      newState: SessionState.MAIN_MENU,
    };
  }

  private async handleMainMenu(
    jid: string,
    cmd: string,
    metadata: Record<string, any>,
  ): Promise<RouteResult> {
    switch (cmd) {
      case '1': {
        this.sessionStore.upsert({
          jid,
          state: SessionState.MAIN_MENU,
          lastInteractionAt: new Date(),
          metadata,
        });
        return {
          response: MESSAGES.ABOUT_US + '\n\n' + MESSAGES.MAIN_MENU,
          newState: SessionState.MAIN_MENU,
        };
      }

      case '2': {
        const result = await this.buildProductListResponse(jid);
        this.sessionStore.upsert({
          jid,
          state: result.newState,
          lastInteractionAt: new Date(),
          metadata,
        });
        return result;
      }

      case '3': {
        const result = await this.buildPromosResponse(jid);
        this.sessionStore.upsert({
          jid,
          state: result.newState,
          lastInteractionAt: new Date(),
          metadata,
        });
        return result;
      }

      case '4': {
        const token = jwt.sign(
          { jid, jti: randomUUID() },
          process.env.JWT_SECRET || 'changeme',
          { expiresIn: '30m' },
        );
        const url = `${process.env.FRONTEND_URL}/pedir?token=${token}`;

        this.sessionStore.upsert({
          jid,
          state: SessionState.MAIN_MENU,
          lastInteractionAt: new Date(),
          metadata,
        });
        return {
          response: MESSAGES.ORDER_LINK(url) + '\n\n' + MESSAGES.MAIN_MENU,
          newState: SessionState.MAIN_MENU,
        };
      }

      case '5': {
        // Delegamos al humano: standby de 2h en backend + cerramos sesión
        // local para que /starthueso no la reactive (el gate de standby
        // tampoco lo permitiría, pero limpiamos por higiene).
        const ok = await this.standbyService.start(
          jid,
          STANDBY_TTL_SECONDS,
          'Cliente solicitó hablar con representante',
        );
        if (!ok) {
          this.logger.warn(`Failed to start standby for ${jid}; falling back to menu`);
          this.sessionStore.upsert({
            jid,
            state: SessionState.MAIN_MENU,
            lastInteractionAt: new Date(),
            metadata,
          });
          return {
            response:
              '⚠️ No pudimos pasarte con un representante en este momento. Intentá de nuevo en un rato.\n\n' +
              MESSAGES.MAIN_MENU,
            newState: SessionState.MAIN_MENU,
          };
        }
        this.sessionStore.delete(jid);
        return {
          response: MESSAGES.REPRESENTATIVE_ACK,
          newState: SessionState.PAUSED,
        };
      }

      default:
        this.sessionStore.upsert({
          jid,
          state: SessionState.MAIN_MENU,
          lastInteractionAt: new Date(),
          metadata,
        });
        return {
          response: MESSAGES.INVALID_OPTION,
          newState: SessionState.MAIN_MENU,
        };
    }
  }

  // -------------------------------------------------------------------
  // PRODUCTS (option 2 → PDF only → back to MAIN_MENU)
  // -------------------------------------------------------------------

  private async buildProductListResponse(jid: string): Promise<RouteResult> {
    try {
      const products = await this.productsService.getProducts();

      if (products.length === 0) {
        return {
          response: MESSAGES.PRODUCTS_EMPTY,
          newState: SessionState.MAIN_MENU,
        };
      }

      const buffer = await this.pdfService.generateCatalog(products);

      return {
        response: MESSAGES.MAIN_MENU,
        newState: SessionState.MAIN_MENU,
        attachment: {
          buffer,
          mimetype: 'application/pdf',
          filename: `catalogo-el-hueso-${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}.pdf`,
          caption: '📦 Acá tenés nuestro catálogo de productos actualizado.',
        },
      };
    } catch (err) {
      this.logger.error('Error building product list', err);
      return {
        response: MESSAGES.PRODUCTS_ERROR,
        newState: SessionState.MAIN_MENU,
      };
    }
  }


  // -------------------------------------------------------------------
  // PROMOTIONS (option 3 → PDF only → back to MAIN_MENU)
  // -------------------------------------------------------------------

  private async buildPromosResponse(_jid: string): Promise<RouteResult> {
    try {
      const promos = await this.promosClient.fetchActive();

      if (promos.length === 0) {
        return {
          response:
            'No hay promociones vigentes en este momento.\n\n' +
            MESSAGES.MAIN_MENU,
          newState: SessionState.MAIN_MENU,
        };
      }

      const buffer = await this.pdfService.generatePromos(promos);

      return {
        response: MESSAGES.MAIN_MENU,
        newState: SessionState.MAIN_MENU,
        attachment: {
          buffer,
          mimetype: 'application/pdf',
          filename: `promos-el-hueso-${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}.pdf`,
          caption: '🔥 Promociones vigentes de Distribuidora El Hueso.',
        },
      };
    } catch (err) {
      this.logger.error('Error building promos PDF', err);
      return {
        response:
          '❌ No pudimos cargar las promociones. Intentá más tarde.\n\n' +
          MESSAGES.MAIN_MENU,
        newState: SessionState.MAIN_MENU,
      };
    }
  }

}
