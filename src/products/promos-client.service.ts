import { Injectable, Logger } from '@nestjs/common';

const BACKEND_BASE =
  process.env.HUESO_BACKEND_URL ||
  'https://hueso-backend-production.up.railway.app/api';

export type PromoType =
  | 'BONUS_UNITS'
  | 'PERCENT_OFF_MIN_QTY'
  | 'PAY_X_FOR_Y';

export interface PromoProduct {
  id: string;
  sku: string | null;
  title: string;
  listType: 'MAYORISTA' | 'MINORISTA';
  priceCents: number; // raw sale price en cents
  weight: string | null;
  flavor: string | null;
  supplier: string | null;
}

export interface PromoBlock {
  id: string;
  name: string;
  type: PromoType;
  params: Record<string, number>;
  branchName: string | null;
  products: PromoProduct[];
}

interface ApiPromoRaw {
  id: string;
  name: string;
  type: PromoType;
  params: Record<string, number>;
  branch: { id: string; name: string } | null;
  products: Array<{
    priority: number;
    product: {
      id: string;
      sku: string | null;
      title: string;
      listType: 'MAYORISTA' | 'MINORISTA';
      prices: { sale?: number; list?: number };
      weight: string | null;
      flavor: string | null;
      supplier: { id: string; name: string } | null;
    };
  }>;
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
export class PromosClientService {
  private readonly logger = new Logger(PromosClientService.name);

  async fetchActive(): Promise<PromoBlock[]> {
    try {
      const res = await fetch(`${BACKEND_BASE}/public/promos`);
      if (!res.ok) {
        this.logger.warn(`Promos fetch HTTP ${res.status}`);
        return [];
      }
      const envelope = (await res.json()) as ApiEnvelope<ApiPromoRaw[]>;
      const data = envelope.data ?? [];
      return data.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        params: p.params,
        branchName: p.branch?.name ?? null,
        products: p.products.map((pp) => ({
          id: pp.product.id,
          sku: pp.product.sku,
          title: pp.product.title,
          listType: pp.product.listType,
          priceCents: pp.product.prices?.sale ?? pp.product.prices?.list ?? 0,
          weight: pp.product.weight,
          flavor: pp.product.flavor,
          supplier: pp.product.supplier?.name ?? null,
        })),
      }));
    } catch (err) {
      this.logger.error('Promos fetch failed', err);
      return [];
    }
  }
}

export function formatPromoLabel(p: Pick<PromoBlock, 'type' | 'params'>): string {
  switch (p.type) {
    case 'BONUS_UNITS':
      return `${p.params.buyQty}+${p.params.freeQty} (llevás ${p.params.buyQty + p.params.freeQty}, pagás ${p.params.buyQty})`;
    case 'PERCENT_OFF_MIN_QTY': {
      const qtyLabel = p.params.exactQty ? `exactamente ${p.params.minQty}` : `${p.params.minQty}+`;
      return `${p.params.percent}% off llevando ${qtyLabel} uds`;
    }
    case 'PAY_X_FOR_Y':
      return `${p.params.takeQty}x${p.params.payQty} (llevás ${p.params.takeQty}, pagás ${p.params.payQty})`;
    default:
      return '';
  }
}
