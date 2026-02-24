import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Pool } from 'pg';
import {
  Product,
  ProductPrices,
  ProductRow,
  formatPrice,
} from './product.interface';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class ProductsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProductsService.name);
  private pool: Pool;
  private cache: { data: Product[]; fetchedAt: number } | null = null;

  onModuleInit() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      this.logger.warn('DATABASE_URL not set — products will be unavailable');
      return;
    }

    this.pool = new Pool({
      connectionString,
      ssl:
        process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    });

    this.logger.log('PostgreSQL pool initialized');
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  async getProducts(): Promise<Product[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      this.logger.debug('Returning cached products');
      return this.cache.data;
    }

    const products = await this.fetchFromDB();
    this.cache = { data: products, fetchedAt: Date.now() };
    return products;
  }

  clearCache(): void {
    this.cache = null;
    this.logger.log('Products cache cleared');
  }

  private async fetchFromDB(): Promise<Product[]> {
    if (!this.pool) {
      this.logger.warn('No database connection — returning empty list');
      return [];
    }

    try {
      const { rows } = await this.pool.query<ProductRow>(
        'SELECT title, prices FROM products ORDER BY title ASC',
      );

      return rows.map((row) => {
        const prices: ProductPrices =
          typeof row.prices === 'string'
            ? (JSON.parse(row.prices) as ProductPrices)
            : row.prices;

        return {
          title: row.title,
          listPrice: formatPrice(prices.list),
          salePrice: formatPrice(prices.sale),
          listRaw: prices.list,
          saleRaw: prices.sale,
        };
      });
    } catch (err) {
      this.logger.error('Failed to fetch products', err);
      return [];
    }
  }
}
