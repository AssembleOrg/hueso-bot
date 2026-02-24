export interface ProductPrices {
  cost: number;
  list: number;
  sale: number;
}

export interface ProductRow {
  title: string;
  prices: ProductPrices | string;
}

export interface Product {
  title: string;
  listPrice: string; // formatted, e.g. "$300.000,00"
  salePrice: string; // formatted, e.g. "$3.200,00"
  listRaw: number; // raw cents value
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
