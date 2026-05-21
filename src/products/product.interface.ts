export interface ProductPrices {
  cost: number;
  list: number;
  sale: number;
}

export type PromoType =
  | 'BONUS_UNITS'
  | 'PERCENT_OFF_MIN_QTY'
  | 'PAY_X_FOR_Y';

export interface RawProductPromo {
  name: string;
  type: PromoType;
  params: Record<string, number>;
}

export interface ProductRow {
  title: string;
  prices: ProductPrices | string;
  weight: string | null;
  flavor: string | null;
  // json_agg de Postgres: array de promos activas asociadas al producto.
  // Puede venir como string si el driver no auto-parsea, o ya como array.
  promos: RawProductPromo[] | string | null;
}

export interface ProductPromoInfo {
  name: string; // nombre completo de la promo, ej. "10+1 Alimentos (El Hueso)"
  label: string | null; // formato corto, ej. "10+1", "-5% x5+"
}

export interface Product {
  title: string;
  weight: string | null; // presentación, ej. "6x3,6kg"
  flavor: string | null; // sabor, ej. "Pollo"
  salePrice: string; // formatted, e.g. "$3.200,00"
  saleRaw: number; // raw cents value
  promos: ProductPromoInfo[]; // todas las promos activas, en orden de prioridad
}

/**
 * Label corto para la columna Producto. Mantiene el texto compacto:
 *  - BONUS_UNITS         → "10+1"
 *  - PERCENT_OFF_MIN_QTY → "-5% x5+" (o "-5% x5" si exactQty)
 *  - PAY_X_FOR_Y         → "5x4"
 */
export function buildPromoLabel(
  type: PromoType | null,
  params: Record<string, number> | null,
): string | null {
  if (!type || !params) return null;
  switch (type) {
    case 'BONUS_UNITS': {
      const buy = params.buyQty;
      const free = params.freeQty;
      if (!buy || !free) return null;
      return `${buy}+${free}`;
    }
    case 'PERCENT_OFF_MIN_QTY': {
      const percent = params.percent;
      const minQty = params.minQty;
      if (!percent || !minQty) return null;
      const qtySuffix = params.exactQty ? `${minQty}` : `${minQty}+`;
      return `-${percent}% x${qtySuffix}`;
    }
    case 'PAY_X_FOR_Y': {
      const take = params.takeQty;
      const pay = params.payQty;
      if (!take || !pay) return null;
      return `${take}x${pay}`;
    }
    default:
      return null;
  }
}

/**
 * Prices come as integers where the last 2 digits are decimals.
 * Example: 320000 → $3.200,00
 */
export function formatPrice(cents: number): string {
  const value = cents / 100;
  const [intPart, decPart] = value.toFixed(2).split('.');
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${formatted},${decPart}`;
}
