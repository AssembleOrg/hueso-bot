export interface ProductPrices {
  cost: number;
  list: number;
  sale: number;
}

export interface ProductRow {
  title: string;
  prices: ProductPrices | string;
  weight: string | null;
  flavor: string | null;
}

export interface Product {
  title: string;
  weight: string | null; // presentación, ej. "6x3,6kg"
  flavor: string | null; // sabor, ej. "Pollo"
  salePrice: string; // formatted, e.g. "$3.200,00"
  saleRaw: number; // raw cents value
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
