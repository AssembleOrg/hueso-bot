import { Test, TestingModule } from '@nestjs/testing';
import { ChatbotService } from './chatbot.service';
import { SessionStoreService } from './session-store.service';
import { SessionState } from './session.interface';

import { ProductsService } from '../products/products.service';
import { PdfService } from '../products/pdf.service';

const mockProducts = [
  {
    title: 'Alitas de pollo',
    listPrice: '$300.000,00',
    salePrice: '$3.200,00',
    listRaw: 30000000,
    saleRaw: 320000,
  },
];

describe('ChatbotService', () => {
  let service: ChatbotService;
  let store: SessionStoreService;
  const JID = '5491112345678@s.whatsapp.net';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatbotService,
        SessionStoreService,
        {
          provide: ProductsService,
          useValue: {
            getProducts: jest.fn().mockResolvedValue(mockProducts),
            clearCache: jest.fn(),
          },
        },
        {
          provide: PdfService,
          useValue: {
            generateCatalog: jest
              .fn()
              .mockResolvedValue(Buffer.from('mock-pdf')),
          },
        },
      ],
    }).compile();

    await module.init();

    service = module.get(ChatbotService);
    store = module.get(SessionStoreService);
  });

  afterEach(() => {
    store.onModuleDestroy();
  });

  describe('/starthueso', () => {
    it('should create a session and return MAIN_MENU', async () => {
      const result = await service.handleMessage(JID, '/starthueso');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.response).toContain('Distribuidora El Hueso');
    });

    it('should work from any state (reset)', async () => {
      await service.handleMessage(JID, '/starthueso');
      await service.handleMessage(JID, '3'); // go to PROMOTIONS_MENU
      const result = await service.handleMessage(JID, '/starthueso');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
    });

    it('should reactivate from PAUSED', async () => {
      await service.handleMessage(JID, '/starthueso');
      await service.handleMessage(JID, '/endhueso');
      const result = await service.handleMessage(JID, '/starthueso');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
    });
  });

  describe('/endhueso', () => {
    it('should pause the session', async () => {
      await service.handleMessage(JID, '/starthueso');
      const result = await service.handleMessage(JID, '/endhueso');
      expect(result!.newState).toBe(SessionState.PAUSED);
      expect(result!.response).toContain('pausada');
    });

    it('should silently ignore messages after pause (no session)', async () => {
      await service.handleMessage(JID, '/starthueso');
      await service.handleMessage(JID, '/endhueso');
      const result = await service.handleMessage(JID, 'hola');
      expect(result).toBeNull();
    });
  });

  describe('option 9 (Finalizar)', () => {
    it('should finalize from MAIN_MENU and delete session', async () => {
      await service.handleMessage(JID, '/starthueso');
      const result = await service.handleMessage(JID, '9');
      expect(result!.newState).toBe(SessionState.PAUSED);
      expect(result!.response).toContain('Gracias');
      expect(store.get(JID)).toBeNull();
    });

    it('should finalize from PROMOTIONS_MENU', async () => {
      await service.handleMessage(JID, '/starthueso');
      await service.handleMessage(JID, '3');
      const result = await service.handleMessage(JID, '9');
      expect(result!.newState).toBe(SessionState.PAUSED);
      expect(store.get(JID)).toBeNull();
    });
  });

  describe('MAIN_MENU options', () => {
    beforeEach(async () => {
      await service.handleMessage(JID, '/starthueso');
    });

    it('option 1 - Sobre nosotros: shows info and returns to MAIN_MENU', async () => {
      const result = await service.handleMessage(JID, '1');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.response).toContain('Distribuidora El Hueso');
      expect(result!.response).toContain('entregas y atención rápida');
    });

    it('option 2 - Productos: sends PDF with caption and menu as response', async () => {
      const result = await service.handleMessage(JID, '2');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.attachment).toBeDefined();
      expect(result!.attachment!.mimetype).toBe('application/pdf');
      expect(result!.attachment!.filename).toMatch(/^catalogo-el-hueso-\d{2}-\d{2}-\d{4}\.pdf$/);
      expect(result!.attachment!.caption).toContain('catálogo de productos');
      expect(result!.response).toContain('Distribuidora El Hueso');
    });

    it('option 3 - Promociones: transitions to PROMOTIONS_MENU', async () => {
      const result = await service.handleMessage(JID, '3');
      expect(result!.newState).toBe(SessionState.PROMOTIONS_MENU);
      expect(result!.response).toContain('Promociones');
    });

    it('option 4 - Pedido: generates order link with JWT and stays in MAIN_MENU', async () => {
      process.env.FRONTEND_URL = 'https://pedidos.example.com';
      process.env.JWT_SECRET = 'test-secret';
      const result = await service.handleMessage(JID, '4');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.response).toContain('https://pedidos.example.com?token=');
      expect(result!.response).toContain('30 minutos');
    });

    it('invalid option: shows error and stays in MAIN_MENU', async () => {
      const result = await service.handleMessage(JID, '7');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.response).toContain('Opción inválida');
    });

    it('text input: shows invalid option error', async () => {
      const result = await service.handleMessage(JID, 'hola');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.response).toContain('Opción inválida');
    });
  });


  describe('PROMOTIONS_MENU', () => {
    it('should return placeholder and go back to MAIN_MENU on any input', async () => {
      await service.handleMessage(JID, '/starthueso');
      await service.handleMessage(JID, '3');
      const result = await service.handleMessage(JID, 'ver promos');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.response).toContain('promociones cargadas');
    });
  });

  describe('session not found', () => {
    it('should return null if no session and not /starthueso', async () => {
      const result = await service.handleMessage(JID, 'hola');
      expect(result).toBeNull();
    });
  });

  describe('TTL expiry', () => {
    it('should treat expired session as non-existent (null)', async () => {
      store.upsert({
        jid: JID,
        state: SessionState.MAIN_MENU,
        lastInteractionAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        metadata: {},
      });

      const result = await service.handleMessage(JID, '1');
      expect(result).toBeNull();
    });
  });

  describe('input normalization', () => {
    it('should handle whitespace around commands', async () => {
      const result = await service.handleMessage(JID, '  /starthueso  ');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
    });

    it('should handle case-insensitive commands', async () => {
      const result = await service.handleMessage(JID, '/STARTHUESO');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
    });
  });
});
