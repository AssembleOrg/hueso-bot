import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { SessionStoreService } from './session-store.service';
import { SessionState, RouteResult } from './session.interface';
import { MESSAGES } from './chatbot.constants';
import { ProductsService } from '../products/products.service';
import { PdfService } from '../products/pdf.service';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    private readonly sessionStore: SessionStoreService,
    private readonly productsService: ProductsService,
    private readonly pdfService: PdfService,
  ) {}

  async handleMessage(jid: string, rawText: string): Promise<RouteResult | null> {
    const text = rawText.trim();
    const cmd = text.toLowerCase();

    // --- Global commands (highest priority) ---

    if (cmd === '/starthueso') {
      return this.startSession(jid);
    }

    if (cmd === '/endhueso') {
      return this.endSession(jid);
    }

    // --- Load session ---

    const session = this.sessionStore.get(jid);

    if (!session) {
      return null;
    }

    // --- Global "9" = Finalizar (from any state) ---

    if (cmd === '9') {
      this.sessionStore.delete(jid);
      return {
        response: MESSAGES.FAREWELL,
        newState: SessionState.PAUSED,
      };
    }

    // --- PAUSED state blocks everything except global commands ---

    if (session.state === SessionState.PAUSED) {
      return {
        response: MESSAGES.PAUSED,
        newState: SessionState.PAUSED,
      };
    }

    // --- Touch session timestamp ---

    session.lastInteractionAt = new Date();

    // --- Route by state ---

    switch (session.state) {
      case SessionState.MAIN_MENU:
        return this.handleMainMenu(jid, cmd, session.metadata);

      case SessionState.PROMOTIONS_MENU:
        return this.handlePromotionsMenu(jid, text);

      default:
        this.logger.warn(`Invalid state "${session.state}" for jid=${jid}`);
        return {
          response: MESSAGES.INVALID_STATE,
          newState: session.state,
        };
    }
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

  private endSession(jid: string): RouteResult {
    this.sessionStore.delete(jid);

    return {
      response: MESSAGES.PAUSED,
      newState: SessionState.PAUSED,
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
        this.sessionStore.upsert({
          jid,
          state: SessionState.PROMOTIONS_MENU,
          lastInteractionAt: new Date(),
          metadata,
        });
        return {
          response: MESSAGES.PROMOTIONS_MENU,
          newState: SessionState.PROMOTIONS_MENU,
        };
      }

      case '4': {
        const token = jwt.sign(
          { jid, jti: randomUUID() },
          process.env.JWT_SECRET || 'changeme',
          { expiresIn: '30m' },
        );
        const url = `${process.env.FRONTEND_URL}?token=${token}`;

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
  // PROMOTIONS_MENU
  // -------------------------------------------------------------------

  private handlePromotionsMenu(jid: string, text: string): RouteResult {
    // TODO: connect to external promotions endpoint
    this.sessionStore.upsert({
      jid,
      state: SessionState.MAIN_MENU,
      lastInteractionAt: new Date(),
      metadata: {},
    });

    return {
      response:
        `Todavía no tenemos promociones cargadas. Pronto las vas a poder ver acá.\n\n` +
        MESSAGES.MAIN_MENU,
      newState: SessionState.MAIN_MENU,
    };
  }

}
