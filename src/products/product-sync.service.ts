import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { formatPrice } from './product.interface';

const API_URL =
  'https://hueso-backend-production.up.railway.app/api/public/products';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface ApiProductPrices {
  list: number;
  cost?: number;
  sale?: number;
}

interface ApiPromotion {
  type: string;
  buyQuantity: number;
  getQuantity: number;
  description: string;
}

interface ApiProduct {
  id: string;
  title: string;
  prices: ApiProductPrices;
  promotion: ApiPromotion | null;
  supplier: { id: string; name: string } | null;
  weight: string | null;
  flavor: string | null;
  isActive: boolean;
  stock: number;
}

export interface CatalogPromotion {
  type: string;
  buyQuantity: number;
  getQuantity: number;
  description: string;
}

export interface CatalogProduct {
  title: string;
  listPrice: string;
  weight: string | null;
  supplier: string | null;
  promotion: CatalogPromotion | null;
}

@Injectable()
export class ProductSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProductSyncService.name);
  private cache: CatalogProduct[] = [];
  private noonTimeout: ReturnType<typeof setTimeout> | null = null;
  private dailyInterval: ReturnType<typeof setInterval> | null = null;

  async onModuleInit() {
    await this.sync();
    this.scheduleNoonSync();
  }

  onModuleDestroy() {
    if (this.noonTimeout) clearTimeout(this.noonTimeout);
    if (this.dailyInterval) clearInterval(this.dailyInterval);
  }

  getProducts(): CatalogProduct[] {
    return this.cache;
  }

  getPromotions(): CatalogProduct[] {
    return this.cache.filter((p) => p.promotion !== null);
  }

  private scheduleNoonSync() {
    const now = new Date();
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);

    if (now >= noon) noon.setDate(noon.getDate() + 1);

    const msUntilNoon = noon.getTime() - now.getTime();
    this.logger.log(
      `Next sync scheduled at 12:00 (in ${Math.round(msUntilNoon / 60000)} min)`,
    );

    this.noonTimeout = setTimeout(() => {
      this.sync();
      this.dailyInterval = setInterval(() => this.sync(), MS_PER_DAY);
    }, msUntilNoon);
  }

  private async sync(): Promise<void> {
    this.logger.log('Syncing products from API...');
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = (await res.json()) as { ok: boolean; data: ApiProduct[] };
      if (!json.ok) throw new Error('API responded with ok=false');

      this.cache = json.data
        .filter((p) => p.isActive)
        .map((p) => ({
          title: p.title,
          listPrice: formatPrice(p.prices.list),
          weight: p.weight,
          supplier: p.supplier?.name ?? null,
          promotion: p.promotion ?? null,
        }));

      this.logger.log(
        `Synced ${this.cache.length} products (${this.getPromotions().length} with promotions)`,
      );
    } catch (err) {
      this.logger.error('Failed to sync products from API', err);
    }
  }
}
