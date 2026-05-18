import { Test, TestingModule } from '@nestjs/testing';
import { ChatbotService } from './chatbot.service';
import { SessionStoreService } from './session-store.service';
import { StandbyService } from './standby.service';
import { SessionState } from './session.interface';

import { ProductsService } from '../products/products.service';
import { PdfService } from '../products/pdf.service';
import { PromosClientService } from '../products/promos-client.service';

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
  let standby: {
    isActive: jest.Mock;
    start: jest.Mock;
    touch: jest.Mock;
  };
  let promosClient: { fetchActive: jest.Mock };
  const JID = '5491112345678@s.whatsapp.net';

  beforeEach(async () => {
    standby = {
      isActive: jest.fn().mockResolvedValue(false),
      start: jest.fn().mockResolvedValue(true),
      touch: jest.fn().mockResolvedValue(undefined),
    };
    promosClient = {
      fetchActive: jest.fn().mockResolvedValue([]),
    };

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
            generateCatalog: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
            generatePromos: jest.fn().mockResolvedValue(Buffer.from('mock-promos-pdf')),
          },
        },
        { provide: StandbyService, useValue: standby },
        { provide: PromosClientService, useValue: promosClient },
      ],
    }).compile();

    await module.init();

    service = module.get(ChatbotService);
    store = module.get(SessionStoreService);
  });

  afterEach(() => {
    store.onModuleDestroy();
  });

  describe('auto-start', () => {
    it('cualquier mensaje sin sesión arranca el menú principal', async () => {
      const result = await service.handleMessage(JID, 'hola');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.response).toContain('Distribuidora El Hueso');
    });

    it('arranca menú aunque el mensaje sea un número suelto', async () => {
      const result = await service.handleMessage(JID, '3');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.response).toContain('Distribuidora El Hueso');
    });

    it('re-arranca menú después de finalizar (opción 9)', async () => {
      await service.handleMessage(JID, 'hola');
      await service.handleMessage(JID, '9');
      const result = await service.handleMessage(JID, 'hola de nuevo');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
    });
  });

  describe('option 9 (Finalizar)', () => {
    it('finaliza desde MAIN_MENU y borra la sesión', async () => {
      await service.handleMessage(JID, 'hola');
      const result = await service.handleMessage(JID, '9');
      expect(result!.newState).toBe(SessionState.PAUSED);
      expect(result!.response).toContain('Gracias');
      expect(store.get(JID)).toBeNull();
    });
  });

  describe('MAIN_MENU options', () => {
    beforeEach(async () => {
      await service.handleMessage(JID, 'hola');
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

    it('option 3 - Promociones (sin promos): mensaje y MAIN_MENU', async () => {
      promosClient.fetchActive.mockResolvedValueOnce([]);
      const result = await service.handleMessage(JID, '3');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.response).toContain('No hay promociones');
      expect(result!.attachment).toBeUndefined();
    });

    it('option 3 - Promociones (con promos): envía PDF', async () => {
      promosClient.fetchActive.mockResolvedValueOnce([
        {
          id: 'p1',
          name: '2x1 alitas',
          type: 'PAY_X_FOR_Y',
          params: { takeQty: 2, payQty: 1 },
          branchName: 'Sucursal 01',
          products: [
            {
              id: 'pr1',
              sku: 'ALI-001',
              title: 'Alitas',
              listType: 'MAYORISTA' as const,
              priceCents: 320000,
              weight: null,
              flavor: null,
              supplier: null,
            },
          ],
        },
      ]);
      const result = await service.handleMessage(JID, '3');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.attachment).toBeDefined();
      expect(result!.attachment!.mimetype).toBe('application/pdf');
      expect(result!.attachment!.filename).toMatch(/^promos-el-hueso-\d{2}-\d{2}-\d{4}\.pdf$/);
    });

    it('option 4 - Pedido: generates order link with JWT and stays in MAIN_MENU', async () => {
      process.env.FRONTEND_URL = 'https://pedidos.example.com';
      process.env.JWT_SECRET = 'test-secret';
      const result = await service.handleMessage(JID, '4');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.response).toContain('https://pedidos.example.com/pedir?token=');
      expect(result!.response).toContain('30 minutos');
    });

    it('option 5 - Representante: dispara standby y queda en PAUSED', async () => {
      const result = await service.handleMessage(JID, '5');
      expect(standby.start).toHaveBeenCalledWith(
        JID,
        expect.any(Number),
        expect.any(String),
      );
      expect(result!.newState).toBe(SessionState.PAUSED);
      expect(result!.response).toContain('representante');
      expect(store.get(JID)).toBeNull();
    });

    it('option 5 - Si backend falla, cae back al menú', async () => {
      standby.start.mockResolvedValueOnce(false);
      const result = await service.handleMessage(JID, '5');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.response).toContain('No pudimos pasarte');
    });

    it('invalid option: shows error and stays in MAIN_MENU', async () => {
      const result = await service.handleMessage(JID, '7');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.response).toContain('Opción inválida');
    });

    it('text input dentro del menú: error de opción inválida', async () => {
      const result = await service.handleMessage(JID, 'que onda');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.response).toContain('Opción inválida');
    });
  });

  describe('standby gate', () => {
    it('ignora todos los mensajes mientras está activo', async () => {
      standby.isActive.mockResolvedValue(true);
      const r1 = await service.handleMessage(JID, 'hola');
      const r2 = await service.handleMessage(JID, '1');
      expect(r1).toBeNull();
      expect(r2).toBeNull();
    });

    it('llama touch con fromMe=false para mensajes del cliente', async () => {
      standby.isActive.mockResolvedValue(true);
      await service.handleMessage(JID, 'hola', false);
      expect(standby.touch).toHaveBeenCalledWith(JID, false);
    });

    it('llama touch con fromMe=true para mensajes del representante', async () => {
      standby.isActive.mockResolvedValue(true);
      await service.handleMessage(JID, 'ya te respondo', true);
      expect(standby.touch).toHaveBeenCalledWith(JID, true);
    });

    it('ignora mensajes fromMe cuando NO hay standby (no auto-reply al dueño)', async () => {
      standby.isActive.mockResolvedValue(false);
      const result = await service.handleMessage(JID, 'hola', true);
      expect(result).toBeNull();
    });
  });

  describe('TTL expiry', () => {
    it('sesión expirada se trata como sin sesión: auto-start de nuevo', async () => {
      store.upsert({
        jid: JID,
        state: SessionState.MAIN_MENU,
        lastInteractionAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        metadata: {},
      });

      const result = await service.handleMessage(JID, '1');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
      expect(result!.response).toContain('Distribuidora El Hueso');
    });
  });

  describe('input normalization', () => {
    it('ignora whitespace alrededor del input', async () => {
      const result = await service.handleMessage(JID, '  hola  ');
      expect(result!.newState).toBe(SessionState.MAIN_MENU);
    });
  });
});
