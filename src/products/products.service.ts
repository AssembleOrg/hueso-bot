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
  RawProductPromo,
  formatPrice,
  buildPromoLabel,
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
      // Filtramos por list_type='MAYORISTA' a propósito: en el bot público
      // mostramos precios mayoristas. NO mencionamos esto en el PDF.
      // Además filtramos por show_in_bot=true para ocultar productos que
      // el cliente marcó como faltante desde el panel admin.
      //
      // json_agg sobre product_promos + promo_templates: por producto
      // traemos TODAS las promos activas, en orden de prioridad. El
      // FILTER + COALESCE garantiza que productos sin promos reciben
      // un array vacío en lugar de [null].
      const { rows } = await this.pool.query<ProductRow>(
        `SELECT p.title,
                p.prices,
                p.weight,
                p.flavor,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'name',   pt.name,
                      'type',   pt.type,
                      'params', pt.params
                    )
                    ORDER BY pp.priority ASC
                  ) FILTER (WHERE pt.id IS NOT NULL),
                  '[]'::json
                ) AS promos
         FROM products p
         LEFT JOIN product_promos pp ON pp.product_id = p.id
         LEFT JOIN promo_templates pt
                ON pt.id = pp.promo_id
               AND pt.is_active = true
         WHERE p.list_type = 'MAYORISTA'
           AND p.is_active = true
           AND p.show_in_bot = true
         GROUP BY p.id, p.title, p.prices, p.weight, p.flavor
         ORDER BY p.title ASC`,
      );

      return rows.map((row) => {
        const prices: ProductPrices =
          typeof row.prices === 'string'
            ? (JSON.parse(row.prices) as ProductPrices)
            : row.prices;

        const rawPromos: RawProductPromo[] =
          typeof row.promos === 'string'
            ? (JSON.parse(row.promos) as RawProductPromo[])
            : (row.promos ?? []);

        return {
          title: row.title,
          weight: row.weight ?? null,
          flavor: row.flavor ?? null,
          salePrice: formatPrice(prices.sale),
          saleRaw: prices.sale,
          promos: rawPromos.map((p) => ({
            name: p.name,
            label: buildPromoLabel(p.type, p.params),
          })),
        };
      });
    } catch (err) {
      this.logger.error('Failed to fetch products', err);
      return [];
    }
  }
}
