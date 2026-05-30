/**
 * Genera un PDF de preview del catálogo con promos.
 *
 * Modo automático:
 *   - Si DATABASE_URL está definido: lee productos + promos directamente
 *     desde Postgres (réplica exacta del query que usa el bot).
 *   - Si no: usa el dataset estático extraído del catálogo de producción
 *     (~370 productos) y asigna promos heurísticamente por marca para
 *     mostrar cómo se verá el PDF en distribución real.
 *
 * Uso:
 *   npx ts-node --transpile-only scripts/preview-catalog.ts
 *
 * Output: scripts/preview-catalog.pdf
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import { PdfService } from '../src/products/pdf.service';
import {
  Product,
  ProductPrices,
  ProductPromoInfo,
  RawProductPromo,
  formatPrice,
  buildPromoLabel,
} from '../src/products/product.interface';

// ──────────────────────────────────────────────────────────────────────
// Catálogo extraído del PDF de producción (catalogo-el-hueso-21-05-2026).
// Formato: title | weight | flavor | priceCents
// "—" en weight/flavor del PDF original → string vacío.
// ──────────────────────────────────────────────────────────────────────
const CATALOG_RAW = `
Absorsol|6kg|Sin perfume|1620000
Absorsol|6x2kg|Sin perfume|960000
Acedan Gotas|||320000
Agility GATO adulto|10kg|Pollo|5410000
Agility GATO gatitos|10kg|Pollo|5855000
Agility GATO Urinary|10kg|Pollo|5855000
Agility PERRO adulto|20kg|Pollo|5366000
Agility PERRO cachorro|20kg|Pollo|6080000
Alpiste 10kg|10kg||1650000
Alta Gama|6kg|Lavanda|2440000
Alta Gama|6kg|Limon|2440000
Arroz Ibis|15kg|Carne|1200000
Arroz Ibis|15kg|Pollo|1200000
Arroz Ibis 5x3|5kg|Pollo|1510000
Arroz Ibis 5x3|5kg|Carne|1510000
Arroz Lummpy|15kg||1200000
Arroz Partido|30kg||2450000
Arroz saborizado|15kg||1100000
Artrin comprimidos (30 comp)|||1750000
Avena|30kg||1350000
Balancear GATO adulto|10kg|Pescado|1200000
Bandejas sanitarias medianas|||250000
BEBEDERO PARA COLIBRÍ|||250000
Biopet GATO adulto|10kg|Pollo, carne y cereales|1950000
Biopet PERRO adulto|20kg|Carne y cereales|2350000
Biopet PERRO adulto|20kg|Cordero|2730000
Biopet PERRO adulto pequeño|15kg|Carne y cereales|1830000
Biopet PERRO cachorro|15kg|Carne y cereales|2390000
Biopet PERRO cordero adulto pequeño|15kg|Cordero|2070000
Caja de pouch Pedigree 12 sabores||Cachorro Carne|1070000
Caja de pouch Pedigree 12 sabores||Adulto Carne|1070000
Caja de pouch Pedigree 12 sabores||Adulto Pollo|1070000
Caja de pouch Pedigree 12 sobres||Adulto R.P Pollo|1070000
Caja de pouch Pedigree 12 sobres|12kg|Adulto R.P Carne|1070000
Caja de Pouch pedigree adulto +7||Carne|1070000
Caja de pouch Whiskas 12 sobres||Sardina|1070000
Caja de pouch Whiskas 12 sobres|12kg|Carne Souffle|1070000
Caja de pouch Whiskas 12 sobres||Gatitos Souffle|1070000
Caja de pouch Whiskas 12 sobres||Pollo|1070000
Caja de pouch Whiskas 12 sobres||Pavo|1070000
Caja de pouch Whiskas 12 sobres||Salmon|1070000
Caja de pouch Whiskas 12 sobres||Gatitos|1070000
Caja de pouch Whiskas 12 sobres||Pescado Souffle|1070000
Canactive PERRO adulto|20kg|Carne y pollo|3250000
Canario|10kg||1400000
Canina PERRO adulto|15kg|Carne|880000
Cardenal|10kg||765000
Carnix PERRO adulto|25kg|Mix de carnes|1730000
Cat Chow GATO adulto|8kg|Carne|3805000
Cat Chow GATO adulto|15kg|Carne|6544000
Cat Chow GATO adulto|15kg|Pescado|6544000
Cat Chow GATO adulto|8kg|Pescado|3805000
Cat Chow GATO gatitos|8kg|Pescado, carne y vegetales|4368000
Cat Chow GATO gatitos|15kg|Pescado, carne y vegetales|7160000
Cat Like|7,5kg|Carne, pollo y pescado|2430000
Cat Like GATO adulto|15kg|Carne, pollo y pescado|4400000
Cat Like GATO adulto|7.5kg|Carne, pollo y pescado|2430000
Cat Pro GATO adulto|7.5kg|Pollo y cereales|3300000
Cat Pro GATO adulto|15kg|Pollo y cereales|6200000
Cat Pro GATO Indoor Urinary|7.5kg|Mix|3400000
Cat Pro GATO Indoor Urinary|15||6500000
Cat Pro GATO kitten|7.5kg|Pollo y cereales|3500000
Cat Seleccion GATO adulto|10kg||3170000
Cidar GATO 1,5 a 3kg|1.5kg||990000
Cidar GATO 3 a 6kg|3kg||1060000
Cidar PERRO 12 a 25kg|12kg||1530000
Cidar PERRO 25 a 50kg|25kg||1830000
Cidar PERRO 3,1 a 6kg|3.1kg||1020000
Cidar PERRO 6 a 12kg|6kg||1170000
Collar Ecthol GATO 40cm|40kg||850000
Collar Ecthol PERRO chico 40cm|40kg||850000
Collar Ecthol PERRO grande 63cm|63kg||940000
Collar Talle 1 (cinta 15mm)|||75000
Collar Talle 2 (cinta 20mm)|||95000
Collar Talle 3 (cinta 20mm)|||105000
Collar Talle 4 (cinta 25mm)|||135000
Collar Talle 5 (cinta 30mm)|||165000
Collar Talle 6 (cinta 30mm)|||175000
Collar Talle 7 (cinta 40mm)|||462000
Collar Talle 8 (cinta 40mm)|||473000
Comedero chico|||57000
Comedero grande|||230000
Comedero mediano|||120000
Company PERRO adulto|20kg|Carne y pollo|3050000
Compinche GATO adulto|20kg|Pescado|2398000
Conejo|25kg||1540000
Cooperacion GATO adulto|10kg|Pescado|2145000
Cooperacion GATO adulto|10kg|Pollo|2145000
Cooperacion PERRO adulto|20kg|Pollo|2775000
Cooperacion PERRO adulto|20kg|Carne|2775000
Cooperacion PERRO cachorro|10kg|Carne|1860000
Correa N° 1 (15mm)|||195000
Correa N° 2 (20mm)|||215000
Correa N° 3 (30mm)|||358000
Correa N° 4 (40mm)|||528000
CUBO 40X40|||1850000
Cuerpitos PERRO adulto|15kg|Carne|1200000
Curavichera Kil Ag 440|||730000
Diabsorb 3x6|3.6 kg||800000
Diabsorb 9x2|9kg|Sin perfume|800000
Dog Chow PERRO adulto mediano|20kg|Carne, pollo y pescado|4635000
Dog Chow PERRO adulto pequeño|20kg|Carne, pollo y pescado|4895000
Dog Chow PERRO cachorro mediano|20kg|Carne, pollo y pescado|5298000
Dog Chow PERRO cachorro pequeño|20kg|Carne, pollo y pescado|5545000
Dog Chow PERRO Senior +7 años|20kg|Carne, pollo y pescado|5650000
Dog Pro PERRO adulto|20kg|Pollo y arroz|5000000
Dog Pro PERRO adulto pequeño|15kg|Pollo y arroz|4300000
Dog Pro PERRO cachorro|10kg|Pollo y arroz|4600000
Dog Pro PERRO Derma Care|15kg|Salmón|4600000
Dog Selection PERRO adulto|21kg|Carne|3515000
Dog Selection PERRO adulto pequeño|15kg|Carne|2630000
Dog Selection PERRO cachorro|21kg|Carne|3985000
Dogtor|20kg||1700000
Dogui PERRO adulto|21kg|Carne, pollo, cereales y vegetales|3636000
Dogui PERRO cachorro|21kg|Carne, pollo, cereales y vegetales|3992000
Dr Perrot PERRO adulto|20kg|Carne y cereales|2100000
Ecthol 5 x 70cc|||440000
Engorde 25kg|25kg||1485000
Estampa GATO adulto|15kg|Pescado y cereales|3420000
Estampa PERRO adulto pequeño Plus|15kg|Carne y cereales|3020000
Estampa PERRO adulto Plus|20kg|Carne y cereales|3700000
Estampa PERRO adulto Tradicional|20kg|Carne y cereales|3100000
Estampa PERRO cachorro Plus|15kg|Carne y cereales|3300000
Eukanuba PERRO adulto grande|15kg|Pollo|6016000
Eukanuba PERRO adulto mediano|15kg|Pollo|6040000
Eukanuba PERRO adulto pequeño|15kg|Pollo|6215000
Eukanuba PERRO cachorro grande|15kg|Pollo|6065000
Eukanuba PERRO cachorro mediano|15kg|Pollo|6065000
Eukanuba PERRO cachorro pequeño|15kg|Pollo|6370000
Excellent GATO adulto|7.5kg|Pollo y arroz|4893000
Excellent GATO adulto|15kg|Pollo y arroz|9442000
Excellent GATO gatitos|7.5kg|Pollo, carne y arroz|5418000
Excellent GATO Mantenimiento|15kg|Pollo, carne y arroz|6949000
Excellent GATO Urinary|15kg|Pollo y arroz|10879000
Excellent GATO Urinary|7.5kg|Pollo y arroz|5639000
Excellent PERRO adulto|20kg|Pollo y arroz|6464000
Excellent PERRO adulto Formula|20kg|Pollo y carne|4930000
Excellent PERRO adulto pequeño|15kg|Pollo y arroz|5670000
Excellent PERRO cachorro|20kg|Pollo y arroz|7332000
Excellent PERRO cachorro Formula|20kg|Pollo y carne|5328000
Excellent PERRO Light|15kg|Pollo y arroz|6259000
Excellent PERRO Senior|15kg|Pollo, carne y arroz|5987000
Gandum PERRO adulto|20kg||1465000
Garrafa|||2400000
Gati GATO adulto|15kg|Pescado y salmón|3868000
Gati GATO adulto|15kg|Carne y pollo|3868000
Gets Comprimidos 11 a 20kg|11kg||400000
Gets Comprimidos 1,4 a 2,7kg|1.4kg||250000
Gets Comprimidos 20 a 40kg|20kg||510000
Gets Comprimidos 2,7 a 5,3kg|2.7kg||310000
Gets Comprimidos 42 a 60kg|42kg||700000
Gets Comprimidos 5 a 10kg|5kg||350000
Girasol 10kg|10kg||1120000
Hectopar GATO Hasta 4kg|4kg||152000
Hectopar GATO Más de 4kg|4kg||152000
Hectopar PERRO 10 a 20kg|10kg||152000
Hectopar PERRO 20 a 40kg|20kg||152000
Hectopar PERRO 40 a 60kg|40kg||152000
Hectopar PERRO 4 a 10kg|4kg||152000
Hectopar PERRO Hasta 4kg|4kg||152000
High Pro Cordero|20kg||3200000
Hortal liquido x 120cc|120cc||360000
Hortal liquido x 250cc|250cc||600000
Hortal liquido x 60cc|60cc||250000
Infinity GATO adulto|10kg|Pollo y arroz|2015000
Infinity PERRO adulto|21kg|Carne|3140000
Infinity PERRO adulto pequeño|15kg|Carne|2390000
Infinity PERRO cachorro|10kg|Carne|1890000
Iniciador 25kg|25kg||1485000
Jaspe PERRO adulto|20kg|Carne|2050000
Jaspe PERRO adulto pequeño|20kg|Carne|2260000
Jaspe PERRO adulto pequeño|8kg|Carne|940000
Jaspe PERRO premiun adulto|15kg|Carne, cereales, vegetales|2690000
Jaspe PERRO premiun cachorro|15kg|Carne, cereales, vegetales|3000000
JUEGUETES PARA PERRO|||1600000
Kit Sanitario (Bandeja, plato y pala)|||370000
Kongo adulto pequeño|15kg|Carne, pollo y vegetales|2050000
Kongo GATO adulto|15kg|Salmon y atún|3290000
Kongo GATO adulto|8kg|Gourmet|1910000
Kongo GATO gatitos|8kg|Carne y leche|2030000
Kongo Gold PERRO adulto|21kg|Harina de pollo y arroz|3370000
Kongo Natural PERRO adulto|21kg|Carne, pollo y vegetales|2625000
Kongo Natural PERRO cachorro|21kg|Carne, pollo y vegetales|3070000
Latas Agility perro y gato Varios||Varios|430000
Latas Cat Pro|90kg||140000
Latas Dog Pro|90kg||140000
Levamisol Oral Nort 15ml|||230000
Maderitas|15kg|Sin perfume|820000
Maitenance Criadores PERRO adulto|22kg|Carne y pollo|2510000
Maitenance Criadores PERRO adulto pequeño|15kg||1905000
Maitenance GATO adulto|10Kg||2840000
Maitenance PERRO adulto pequeño|15kg||1905000
Maitenance PERRO cachorro|15kg||2080000
Maiz Entero|30kg||1300000
Maiz picado FINO|24kg||1070000
Maiz picado GRUESO|24kg||1070000
Maíz pisado fino|24kg||1070000
Maíz pisado grueso|24kg||1070000
Matute PERRO adulto Carne asada|20kg|Carne asada|1620000
MAXI BOLSOS ANTIDESGARRO|||1450000
Mezcla|25kg||1070000
Mijo|10kg||750000
MOISES CUADRADO|||3000000
MOISES FLOR 60 DM|||2300000
Nexgard comprimido 10 a 25kg|10 a 25kg||1870000
Nexgard comprimido 25 a 50kg|25 a 50kg|carne|2200000
Nexgard comprimido 2 a 5kg|2 a 5kg||1210000
Nexgard comprimido 5 a 10kg|5 a 10kg||1340000
NIDO REGULABLE|||1800000
Nutribon PERRO adulto|20kg|Carne, cereales, pollo y vegetales|2090000
Nutribon PERRO adulto pequeño|20kg|Carne, cereales, pollo y vegetales|2865000
Nutribon PERRO cachorro|15kg|Carne, cereales, pollo y vegetales|2080000
Old prince adulto|7,5|Cordero y arroz integral|3380000
Old Prince Equilibrium GATO adulto|7.5kg|Pollo y arroz|3900000
Old Prince Equilibrium GATO Urinary|7.5kg|Pollo y arroz|4470000
Old Prince Equilibrium PERRO adulto|20kg|Pollo y arroz|5170000
Old Prince Equilibrium PERRO adulto pequeño|15kg|Pollo y arroz|4580000
Old Prince Equilibrium PERRO cachorro|15kg|Pollo y arroz|4580000
Old Prince PERRO adulto C. A.|15kg|Cordero y arroz integral|5540000
Old Prince PERRO adulto pequeño|15kg|Cordero y arroz integral|6310000
Old Prince PERRO cachorro|15kg|Cordero y arroz integral|6310000
Old Prince Premiun GATO ADULTO|7.5kg||2750000
Old Prince Premiun GATO gatitos|7.5kg|Harina de pollo y cordero|3020000
Old Prince Premiun PERRO adulto|20kg|Pollo y carne|4470000
Old Prince Premiun PERRO adulto|15kg|Cordero|5000000
Pacha PERRO adulto|22kg|Carne|2240000
PACK DE YERBA|||0
PACK X4 MOISES|||2100000
PANTUNIDO 40X50|||2000000
Pedigree PERRO adulto|21kg|Carne, pollo y cereales|4730000
Pedigree PERRO adulto R.P|21kg|Carne, pollo y cereales|4730000
Pedigree PERRO cachorro|21kg|Carne, pollo y cereales|5025000
Performance GATO adulto 7,5kg|7,5kg||5670000
Performance PERRO adulto|20kg|Pollo y carne|7830000
Performance PERRO cachorro|15kg|Pollo y carne|6580000
Piedra Aglutinante Rubicat bidon 11kg|||1115000
Piedra MICHI FUZ 10x2|10kg|Sin perfume|800000
Piedras aglutinantes bidón||11kg|1115000
Piedras aglutinantes Rubicat bolsa||10kg|850000
Piedras aglutinantes starcats bidón||5kg|430000
Piedras a granel 10kg|||400000
Piedras a granel 25kg|25kg|Sin perfume|830000
Piedras a granel Golden Breeze|15kg|Lavanda|1500000
Postura|25kg||1485000
Power Comprimidos PERRO 20 a 30kg|20kg||850000
Power Comprimidos PERRO 30 a 40kg|30kg||997000
Power Comprimidos PERRO/GATO 10 a 20kg|10kg||680000
Power Comprimidos PERRO/GATO 2,5 a 5kg|2.5kg||567000
Power Comprimidos PERRO/GATO 5 a 10kg|5kg||620000
Power Gold Comprido PERRO 10 a 20kg|10kg|1 MES|1365000
Power Gold Comprido PERRO 20 a 40kg|20kg|1 MES|1575000
Power Gold Comprido PERRO 2,5 a 5kg|2.5kg|1 MES|1008000
Power Gold Comprido PERRO 40 a 56kg|40kg|1 MES|1806000
Power Gold Comprido PERRO 5 a 10kg|5kg|1 MES|1070000
Power Gold Comprimidos PERRO 3m 10 a 20kg|10kg|3 MESES|2583000
Power Gold Comprimidos PERRO 3m 20 a 40kg|20kg|3 MESES|2960000
Power Gold Comprimidos PERRO 3m 2 a 5kg|2kg|3 MESES|1753000
Power Gold Comprimidos PERRO 3m 40 a 56kg|40kg|3 MESES|3570000
Power Gold Comprimidos PERRO 3m 5 a 10kg|5kg|3 MESES|1850000
Power Ultra PERRO 11 a 20kg|11kg||336000
Power Ultra PERRO 21 a 40kg|21kg||514000
Power Ultra PERRO 2 a 4kg|2kg||270000
Power Ultra PERRO 41 a 60kg|41kg||525000
Power Ultra PERRO 5 a 10kg|5kg||315000
Pretal con correa N° 1 (15mm)|||370000
Pretal con correa N° 2 (20mm)|||425000
Pretal con correa N° 3 (20mm)|||476000
Pretal con correa N° 4 (25mm)|||660000
Pretal con correa N° 5 (30mm)|||790000
Pretal con correa N° 6 (40mm)|||1460000
Pro Plan GATO adulto|15kg|Carne de pollo|13523000
Pro Plan GATO adulto|7.5kg|Carne de pollo|7730000
Pro Plan GATO gatitos|7.5kg|Carne de pollo|8530000
Pro Plan GATO Urinary|7.5kg|Carne de pollo|8460000
Pro Plan GATO Urinary|15kg|Carne de pollo|14480000
Pro Plan PERRO adulto complete|15kg|Carne de pollo|9099000
Pro Plan PERRO adulto pequeño|7.5kg|Carne de pollo|5750000
Pro Plan PERRO cachorro complete|15kg|Carne de pollo|10000000
Pro Plan PERRO cachorro pequeño|7.5kg|Carne de pollo|6350000
Pro Plan PERRO Senior +7 años|15kg|Carne de pollo|10019000
Provet PERRO adulto Alta Performance|20kg|Pollo y arroz|4200000
Provet PERRO cachorro|15kg|Pollo y arroz|3560000
RASCADORES|||650000
Raza GATO adulto|15kg|Mix|3230000
Raza GATO adulto|10kg|Mix|2265000
Raza GATO adulto|10kg|Pollo y leche|2265000
Raza GATO adulto|15kg|Pescado|3230000
Raza GATO adulto|10kg|Pescado|2265000
Raza GATO gatitos|8kg|Carne y leche|2090000
Raza PERRO adulto|21kg|Carne|2730000
Raza PERRO adulto|21kg|Mix|2730000
Raza PERRO cachorro|15kg|Carne|2450000
Rosco GATO adulto|10kg|Pescado|1690000
Rosco GATO adulto|10kg|Cocktail|1760000
Rosco PERRO adulto|15kg|Carne|1540000
Rosco PERRO adulto|15kg|Pollo|1540000
Rosco PERRO adulto|15kg|Cocktail|1680000
Royal Canin FIT 32 15kg|15kg||14900000
Royal Canin PERRO Maxi adulto|15kg|Pollo y arroz|10030000
Royal Canin PERRO Maxi cachorro|15kg|Pollo y arroz|10710000
Royal Canin PERRO Medium adulto|15kg|Pollo y arroz|10075000
Royal Canin PERRO Medium cachorro|15kg|Pollo y arroz|10710000
Royal Canin PERRO Mini adulto 15kg|15kg||10625000
Royal Canin PERRO Mini adulto 7,5kg|7.5kg|Pollo y arroz|6450000
Royal Canin PERRO Mini cachorro 15kg|15kg||11017000
Royal Canin PERRO Mini cachorro 7,5kg|7.5kg|Pollo y arroz|5893000
Royal canin urinary SO||7,5kg|10015000
Royal canin urinary SO|7.5kg||10015000
Sabrositos GATO adulto|10kg|Mix|2080000
Sabrositos PERRO adulto|18kg|Mix|2570000
Shampoo 2 en 1|||541000
Shampoo Medicado Hipoalergenico|||550000
Shampoo Osspret Cachorro|||450000
Shampoo Tradicional|||503000
Sieger Criadores PERRO adulto|20kg|Pollo y cereales|7335000
Sieger Criadores PERRO cachorro|15kg|Pollo y cereales|7340000
Simparica 10 - 20|10-20kg||1650000
Simparica 20 - 40|20-40kg||1930000
Simparica 2.5 - 5|2.5 - 5kg||1240000
Simparica 40 - 60|40-60kg||2300000
Simparica 5 - 10|5-10kg||1270000
Talco Elmer|||250000
Test|10kg|Carne|500
The Best 10x1,8 Sin perfume 10kg|10kg|Sin perfume|1250000
The Best 6x3,6 Sin perfume 6kg|6kg|Sin perfume|1350000
Tierra común|||300000
Tierra fertil 10 DM3|10kg||250000
Tierra fertil 25 DM3|25kg||470000
Tierra fertil 40 DM3|40kg||650000
Tierra fertil 5 DM3|5kg||186000
Total Balance PERRO adulto|20kg|Pollo y carne|2075000
Total Full comprimido GATO|||290000
Total Full comprimido PERRO Hasta 10kg|10kg||250000
Total Full comprimido PERRO Hasta 20kg|20kg||290000
Total Full comprimido PERRO Hasta 60kg|60kg||500000
Total Full GATO y PERRO CG|||600000
Total Full Suspensión GATO|||450000
Total Full Suspensión PERRO|||460000
Turbocan PERRO adulto|20kg|Carne|1688000
Vagoneta GATO adulto|10kg|Pescado y pollo|2000000
Vagoneta GATO adulto|20kg|Pescado y pollo|3800000
Vagoneta GATO gatitos|10kg|Carne y leche|2150000
Vagoneta PERRO adulto|15kg|Carne, pollo y vegetales|1820000
Vagoneta PERRO cachorro|15kg|Carne|2400000
VC Balanced GATO adulto|7.5kg|Pollo y arroz|4965000
VC Balanced GATO adulto|15kg|Pollo y arroz|9235000
VC Balanced GATO gatitos|7.5kg|Pollo y arroz|5490000
VC Balanced GATO ph control|7.5kg|Pollo y arroz|5540000
VC Balanced PERRO adulto grande|20kg|Carne, pollo y arroz|6000000
VC Balanced PERRO adulto mediano|20kg|Carne, pollo y arroz|6000000
VC Balanced PERRO adulto pequeño|15kg|Carne, pollo y arroz|5100000
VC Balanced PERRO adulto pequeño|7.5kg|Carne, pollo y arroz|3010000
VC Balanced PERRO cachorro grande|20kg|Carne, pollo y arroz|7350000
VC Balanced PERRO cachorro mediano|20kg|Carne, pollo y arroz|7350000
VC Balanced PERRO cachorro pequeño|7.5kg|Carne, pollo y arroz|3595000
VC Balanced PERRO Control de peso|20kg|Carne, pollo y arroz|7490000
Vc Balanced PERRO Recipe Cordero|15kg|Cordero|0
VC Belcan PERRO adulto|22kg|Pollo y carne|2398000
VC Belcan PERRO adulto SAFETY|24kg|Pollo y carne|2935000
VC Belcan PERRO cachorro|15kg|Pollo y carne|1956000
VC Belcat GATO adulto|10kg|Pescado|1973000
VC Belcat GATO adulto Safety|24kg|Pescado|4736000
VC Complete GATO adulto|15kg|Pollo y arroz|5715000
VC Complete GATO adulto|7.5kg|Pollo y arroz|2640000
VC Complete GATO gatitos|15kg||6000000
VC Complete GATO gatitos|7.5kg|Pollo y arroz|2860000
VC Complete PERRO adulto|20kg|Carne, pollo y arroz|4515000
VC Complete PERRO cachorro|20kg|Carne, pollo y arroz|4975000
VC Complete PERRO Control de peso|20kg|Carne, pollo y cereales|4565000
VC Complete PERRO Senior|20kg|Carne, pollo y cereales|4565000
VC Premiun GATO adulto|7.5kg|Carne, pollo y cereales|2612000
VC Premiun GATO adulto|15kg|Carne, pollo y cereales|5019000
VC Premiun GATO gatitos|7.5kg|Pollo y cereales|2730000
VC Premiun GATO Urinary|7.5kg|Pollo, carne y cereales|2878000
VC Premiun PERRO adulto|20kg|Cordero|4215000
VC Premiun PERRO adulto|20kg|Carne, pollo y cereales|3493000
VC Premiun PERRO adulto pequeño|20kg|Carne, pollo y cereales|3557000
VC Premiun PERRO cachorro|20kg|Carne, pollo y cereales|4120000
Vivaz GATO adulto|10kg|Pescado|1500000
Voraz GATO adulto|10kg|Pescado|1660000
Voraz GATO adulto|20kg|Pescado|3090000
Voraz GATO gatitos|15kg|Pescado y pollo|2700000
Voraz PERRO adulto|22+3kg|Carne|2090000
Voraz PERRO cachorro|20kg|Carne|2415000
Whiskas GATO adulto|10kg|Carne|3800000
Whiskas GATO adulto|10kg|Pollo|3800000
Whiskas GATO adulto|10kg|Pescado|3800000
Whiskas GATO gatitos|10kg|Carne y leche|3800000
`.trim();

interface ParsedRow {
  title: string;
  weight: string | null;
  flavor: string | null;
  saleCents: number;
}

function parseCatalogRaw(raw: string): ParsedRow[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, weight, flavor, cents] = line.split('|');
      return {
        title: title.trim(),
        weight: weight?.trim() ? weight.trim() : null,
        flavor: flavor?.trim() ? flavor.trim() : null,
        saleCents: parseInt(cents, 10) || 0,
      };
    });
}

// Heurística de asignación de promos basada en marca / familia.
// Aproxima la realidad del local: alimentos masivos (Pedigree/Whiskas/Dog
// Chow/Cat Chow/Eukanuba) llevan 10+1; premium (Pro Plan/Royal Canin/
// Excellent/Old Prince) llevan -5% x5+. Algunos van con ambas.
// Simulamos también que cada promo existe duplicada (Hueso y Ladrador)
// como ocurre en producción — el filtro/strip del service productivo
// se replica abajo para que el preview refleje el resultado final.
const PROMO_10_PLUS_1_HUESO: RawProductPromo = {
  name: '10+1 Alimentos (El Hueso)',
  type: 'BONUS_UNITS',
  params: { buyQty: 10, freeQty: 1 },
};
const PROMO_10_PLUS_1_LADRADOR: RawProductPromo = {
  name: '10+1 Alimentos (El Ladrador)',
  type: 'BONUS_UNITS',
  params: { buyQty: 10, freeQty: 1 },
};
const PROMO_5_OFF_X5_HUESO: RawProductPromo = {
  name: 'X5 -5% Mayorista (El Hueso)',
  type: 'PERCENT_OFF_MIN_QTY',
  params: { minQty: 5, percent: 5 },
};
const PROMO_5_OFF_X5_LADRADOR: RawProductPromo = {
  name: 'X5 -5% Mayorista (El Ladrador)',
  type: 'PERCENT_OFF_MIN_QTY',
  params: { minQty: 5, percent: 5 },
};

function assignPromos(title: string): RawProductPromo[] {
  const t = title.toLowerCase();
  const promo10plus1 =
    /\b(pedigree|whiskas|dog chow|cat chow|eukanuba|sieger|performance|caja de pouch)\b/i;
  const promo5offX5 =
    /\b(pro plan|proplan|royal canin|excellent|old prince|nutribon|vc balanced|vc complete|vc premiun|biopet|dog pro|cat pro|agility)\b/i;
  // Algunas marcas top participan de ambas promos (acumulables).
  const dualPromo = /\b(pro plan|proplan|royal canin|pedigree)\b/i;

  const promos: RawProductPromo[] = [];
  // Cada producto que aplica recibe AMBAS versiones (Hueso + Ladrador)
  // para simular lo que devuelve la DB sin filtro.
  if (promo10plus1.test(t) || dualPromo.test(t)) {
    promos.push(PROMO_10_PLUS_1_HUESO, PROMO_10_PLUS_1_LADRADOR);
  }
  if (promo5offX5.test(t) || dualPromo.test(t)) {
    promos.push(PROMO_5_OFF_X5_HUESO, PROMO_5_OFF_X5_LADRADOR);
  }
  return promos;
}

/**
 * Replica el filtro+strip que ahora hace el SQL + mapping de
 * `products.service.ts` en producción: deja solo las promos cuya rama
 * sea "El Ladrador" (acá lo inferimos por el sufijo del nombre) y
 * limpia el sufijo del nombre.
 */
function applyLadradorFilter(promos: RawProductPromo[]): RawProductPromo[] {
  return promos
    .filter((p) => /\((?:el\s+)?ladrador\)\s*$/i.test(p.name))
    .map((p) => ({
      ...p,
      name: p.name.replace(/\s*\((?:el\s+)?(ladrador|hueso)\)\s*$/i, '').trim(),
    }));
}

function toPromoInfo(raw: RawProductPromo): ProductPromoInfo {
  return { name: raw.name, label: buildPromoLabel(raw.type, raw.params) };
}

/**
 * Heurística de categoría SOLO para el preview estático (sin DB). En
 * producción la categoría viene de product_stocks→categories. Acá la
 * inferimos por palabras clave del título para mostrar cómo se ve el
 * agrupado del PDF.
 */
function assignCategory(title: string): string {
  const t = title.toLowerCase();
  if (/\b(gato|gatos|gatit|cat|felin)\b/i.test(t)) return 'Gatos';
  if (/\b(perro|perros|dog|can|canin|cachorro)\b/i.test(t)) return 'Perros';
  if (/(canario|cardenal|alpiste|colibr|pajar|\bave\b|aves|loro|periquito|jilguero)/i.test(t))
    return 'Aves';
  if (/(collar|comedero|bebedero|bandeja|juguete|correa|pretal|cucha|transportadora|arena|sanitaria)/i.test(t))
    return 'Accesorios';
  if (/(absorsol|alta gama|piedra|shampoo|pipeta|antipulga|talco|ecthol|gotas|comprimido|artrin|acedan)/i.test(t))
    return 'Higiene y salud';
  return 'Otros';
}

// ──────────────────────────────────────────────────────────────────────
// Modo DB: si DATABASE_URL está definido, lee productos + promos reales
// con el mismo query que va a producción.
// ──────────────────────────────────────────────────────────────────────
async function fetchFromDb(): Promise<Product[]> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  });

  try {
    const { rows } = await pool.query<{
      title: string;
      category: string | null;
      prices: ProductPrices | string;
      weight: string | null;
      flavor: string | null;
      promos: RawProductPromo[] | string | null;
    }>(
      `SELECT p.title, c.name AS category, p.prices, p.weight, p.flavor,
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
       LEFT JOIN product_stocks ps ON ps.id = p.stock_id
       LEFT JOIN categories c ON c.id = ps.category_id
       LEFT JOIN product_promos pp ON pp.product_id = p.id
       LEFT JOIN promo_templates pt
              ON pt.id = pp.promo_id
             AND pt.is_active = true
       WHERE p.list_type = 'MAYORISTA'
         AND p.is_active = true
         AND p.show_in_bot = true
       GROUP BY p.id, p.title, c.name, p.prices, p.weight, p.flavor
       ORDER BY c.name ASC NULLS LAST, p.title ASC`,
    );

    return rows.map((row) => {
      const prices =
        typeof row.prices === 'string'
          ? (JSON.parse(row.prices) as ProductPrices)
          : row.prices;
      const rawPromos: RawProductPromo[] =
        typeof row.promos === 'string'
          ? (JSON.parse(row.promos) as RawProductPromo[])
          : (row.promos ?? []);
      return {
        title: row.title,
        category: row.category ?? null,
        weight: row.weight ?? null,
        flavor: row.flavor ?? null,
        salePrice: formatPrice(prices.sale),
        saleRaw: prices.sale,
        promos: rawPromos.map(toPromoInfo),
      };
    });
  } finally {
    await pool.end();
  }
}

function buildFromStatic(): Product[] {
  const parsed = parseCatalogRaw(CATALOG_RAW);
  const products = parsed.map((r) => ({
    title: r.title,
    category: assignCategory(r.title),
    weight: r.weight,
    flavor: r.flavor,
    salePrice: formatPrice(r.saleCents),
    saleRaw: r.saleCents,
    // assignPromos devuelve promos duplicadas (Hueso + Ladrador) como
    // ocurre en DB; applyLadradorFilter replica el filtro+strip del SQL.
    promos: applyLadradorFilter(assignPromos(r.title)).map(toPromoInfo),
  }));
  // El PDF agrupa por categoría asumiendo que los productos vienen
  // ordenados por categoría (como hace el SQL en producción con
  // ORDER BY c.name NULLS LAST, p.title). Replicamos ese orden acá.
  return products.sort(
    (a, b) =>
      a.category.localeCompare(b.category, 'es') ||
      a.title.localeCompare(b.title, 'es'),
  );
}

async function main() {
  let products: Product[];
  let source: string;

  if (process.env.DATABASE_URL) {
    console.log('→ DATABASE_URL detectado, leyendo productos + promos reales…');
    products = await fetchFromDb();
    source = 'DB (real)';
  } else {
    console.log('→ Sin DATABASE_URL, usando dataset estático del catálogo…');
    products = buildFromStatic();
    source = 'mock estático (heurística por marca)';
  }

  const svc = new PdfService();
  const buf = await svc.generateCatalog(products);
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  const out = join(__dirname, `preview-catalog-${stamp}.pdf`);
  writeFileSync(out, buf);

  const withPromo = products.filter((p) => p.promos.length > 0).length;
  const multiPromo = products.filter((p) => p.promos.length > 1).length;
  console.log(`✓ PDF preview escrito en: ${out}`);
  console.log(`  fuente: ${source}`);
  console.log(
    `  ${products.length} productos · ${withPromo} con promo · ${multiPromo} con 2+ promos`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
