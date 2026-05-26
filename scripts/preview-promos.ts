/**
 * Genera un PDF de preview del catálogo de promociones (opción 3 del bot).
 *
 * Modo automático:
 *   - Si HUESO_BACKEND_URL está definido: golpea /public/promos y aplica
 *     el filtro de Ladrador exactamente como en producción.
 *   - Si no: usa mock data con ambas sucursales (Hueso + Ladrador) para
 *     probar que el filtro y el strip de sufijo funcionan.
 *
 * Uso:
 *   npx ts-node --transpile-only scripts/preview-promos.ts
 *
 * Output: scripts/preview-promos-<timestamp>.pdf
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PdfService } from '../src/products/pdf.service';
import {
  PromosClientService,
  PromoBlock,
  PromoProduct,
} from '../src/products/promos-client.service';

// ──────────────────────────────────────────────────────────────────────
// Mock data: replica el escenario real donde cada promo existe duplicada
// para El Hueso y El Ladrador, con (potencialmente) productos distintos.
// El filtro debe quedarse SOLO con las de "El Ladrador" y limpiar el
// sufijo del nombre.
// ──────────────────────────────────────────────────────────────────────

const sampleProducts = (kind: 'alimentos' | 'snacks'): PromoProduct[] => {
  if (kind === 'alimentos') {
    return [
      { id: '1',  sku: 'PED-001', title: 'Pedigree Adulto Carne',          listType: 'MAYORISTA', priceCents: 1850000, weight: '15kg',   flavor: 'Carne',   supplier: 'Mars' },
      { id: '2',  sku: 'PED-002', title: 'Pedigree Adulto Pollo',          listType: 'MAYORISTA', priceCents: 1850000, weight: '15kg',   flavor: 'Pollo',   supplier: 'Mars' },
      { id: '3',  sku: 'PED-003', title: 'Pedigree Cachorro',              listType: 'MAYORISTA', priceCents: 2100000, weight: '15kg',   flavor: 'Pollo',   supplier: 'Mars' },
      { id: '4',  sku: 'DC-001',  title: 'Dog Chow Adulto Mediano',        listType: 'MAYORISTA', priceCents: 4635000, weight: '20kg',   flavor: 'Mix',     supplier: 'Purina' },
      { id: '5',  sku: 'DC-002',  title: 'Dog Chow Cachorro Mediano',      listType: 'MAYORISTA', priceCents: 5298000, weight: '20kg',   flavor: 'Mix',     supplier: 'Purina' },
      { id: '6',  sku: 'CC-001',  title: 'Cat Chow GATO adulto Carne',     listType: 'MAYORISTA', priceCents: 6544000, weight: '15kg',   flavor: 'Carne',   supplier: 'Purina' },
      { id: '7',  sku: 'CC-002',  title: 'Cat Chow GATO adulto Pescado',   listType: 'MAYORISTA', priceCents: 6544000, weight: '15kg',   flavor: 'Pescado', supplier: 'Purina' },
      { id: '8',  sku: 'WK-001',  title: 'Whiskas GATO adulto Carne',      listType: 'MAYORISTA', priceCents: 3800000, weight: '10kg',   flavor: 'Carne',   supplier: 'Mars' },
      { id: '9',  sku: 'WK-002',  title: 'Whiskas GATO adulto Pescado',    listType: 'MAYORISTA', priceCents: 3800000, weight: '10kg',   flavor: 'Pescado', supplier: 'Mars' },
      { id: '10', sku: 'EUK-001', title: 'Eukanuba PERRO adulto grande',   listType: 'MAYORISTA', priceCents: 6016000, weight: '15kg',   flavor: 'Pollo',   supplier: 'Mars' },
    ];
  }
  return [
    { id: '20', sku: 'SN-001',  title: 'Pro Plan PERRO adulto pequeño',   listType: 'MAYORISTA', priceCents: 5750000, weight: '7.5kg',  flavor: 'Carne de pollo', supplier: 'Purina' },
    { id: '21', sku: 'SN-002',  title: 'Pro Plan GATO adulto',            listType: 'MAYORISTA', priceCents: 7730000, weight: '7.5kg',  flavor: 'Carne de pollo', supplier: 'Purina' },
    { id: '22', sku: 'RC-001',  title: 'Royal Canin Mini adulto',         listType: 'MAYORISTA', priceCents: 6450000, weight: '7.5kg',  flavor: 'Pollo y arroz',  supplier: 'Royal Canin' },
    { id: '23', sku: 'RC-002',  title: 'Royal Canin Maxi adulto',         listType: 'MAYORISTA', priceCents: 10030000, weight: '15kg',  flavor: 'Pollo y arroz',  supplier: 'Royal Canin' },
    { id: '24', sku: 'EX-001',  title: 'Excellent PERRO adulto',          listType: 'MAYORISTA', priceCents: 6464000, weight: '20kg',   flavor: 'Pollo y arroz',  supplier: 'Excellent' },
    { id: '25', sku: 'EX-002',  title: 'Excellent GATO adulto',           listType: 'MAYORISTA', priceCents: 4893000, weight: '7.5kg',  flavor: 'Pollo y arroz',  supplier: 'Excellent' },
    { id: '26', sku: 'OP-001',  title: 'Old Prince PERRO adulto',         listType: 'MAYORISTA', priceCents: 5540000, weight: '15kg',   flavor: 'Cordero',        supplier: 'Old Prince' },
    { id: '27', sku: 'OP-002',  title: 'Old Prince Equilibrium GATO',     listType: 'MAYORISTA', priceCents: 3900000, weight: '7.5kg',  flavor: 'Pollo y arroz',  supplier: 'Old Prince' },
  ];
};

const mockPromos: PromoBlock[] = [
  // Versiones El Hueso — el filtro las debe descartar
  {
    id: 'h1',
    name: '10+1 Alimentos (El Hueso)',
    type: 'BONUS_UNITS',
    params: { buyQty: 10, freeQty: 1 },
    branchName: 'El Hueso',
    products: sampleProducts('alimentos').slice(0, 4),
  },
  {
    id: 'h2',
    name: 'X5 -5% Mayorista (El Hueso)',
    type: 'PERCENT_OFF_MIN_QTY',
    params: { minQty: 5, percent: 5 },
    branchName: 'El Hueso',
    products: sampleProducts('snacks').slice(0, 3),
  },
  // Versiones El Ladrador — son las que deben quedar en el PDF, sin sufijo
  {
    id: 'l1',
    name: '10+1 Alimentos (El Ladrador)',
    type: 'BONUS_UNITS',
    params: { buyQty: 10, freeQty: 1 },
    branchName: 'El Ladrador',
    products: sampleProducts('alimentos'),
  },
  {
    id: 'l2',
    name: 'X5 -5% Mayorista (El Ladrador)',
    type: 'PERCENT_OFF_MIN_QTY',
    params: { minQty: 5, percent: 5 },
    branchName: 'El Ladrador',
    products: sampleProducts('snacks'),
  },
];

/**
 * Replica EXACTA del filtro que aplica `PromosClientService.fetchActive`
 * sobre la respuesta del backend. Lo dejamos acá para poder testear el
 * pipeline sin depender de la red.
 */
function applyLadradorFilter(promos: PromoBlock[]): PromoBlock[] {
  const stripBranch = (name: string) =>
    name.replace(/\s*\((?:el\s+)?(ladrador|hueso)\)\s*$/i, '').trim();
  return promos
    .filter(
      (p) => p.branchName?.trim().toLowerCase() === 'el ladrador',
    )
    .map((p) => ({ ...p, name: stripBranch(p.name) }));
}

async function main() {
  let promos: PromoBlock[];
  let source: string;

  if (process.env.HUESO_BACKEND_URL) {
    console.log('→ HUESO_BACKEND_URL detectado, leyendo /public/promos real…');
    const client = new PromosClientService();
    promos = await client.fetchActive();
    source = `DB real (${process.env.HUESO_BACKEND_URL})`;
  } else {
    console.log(
      '→ Sin HUESO_BACKEND_URL, usando mock con ambas sucursales para validar filtro…',
    );
    promos = applyLadradorFilter(mockPromos);
    source = 'mock (filtrado a Ladrador, sufijo limpio)';
  }

  const svc = new PdfService();
  const buf = await svc.generatePromos(promos);
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  const out = join(__dirname, `preview-promos-${stamp}.pdf`);
  writeFileSync(out, buf);

  console.log(`✓ PDF preview escrito en: ${out}`);
  console.log(`  fuente: ${source}`);
  console.log(`  ${promos.length} promos en el PDF`);
  for (const p of promos) {
    console.log(
      `   - "${p.name}" (${p.type}, ${p.products.length} productos, branch=${p.branchName ?? 'null'})`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
