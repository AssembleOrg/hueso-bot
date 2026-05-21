import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { existsSync } from 'fs';
import { join } from 'path';
import { Product, formatPrice } from './product.interface';
import { PromoBlock, formatPromoLabel } from './promos-client.service';

const NAVY = '#1B2A4A';
const ORANGE = '#E8842C';
const LIGHT_BG = '#F8F9FA';
const WHITE = '#FFFFFF';
const DARK_TEXT = '#1a1a1a';
const SUBTLE_TEXT = '#6b7280';
const BORDER = '#E5E7EB';

const MARGIN = 28;
const HEADER_H = 64;
const FOOTER_H = 20;

// Catálogo de productos: tabla compacta. Apuntamos a ~50 productos/página
// reduciendo padding e interlineado al mínimo legible.
const CATALOG_ROW_MIN_H = 13; // alto mínimo cuando no hay promos
const CATALOG_HEAD_H = 16;
const CATALOG_PROMO_LINE_H = 9; // alto por cada promo extra apilada
const CATALOG_ROW_VPAD = 3.5; // padding top dentro de cada fila
// Anchos proporcionales de columna (suman al contentW disponible).
const CATALOG_COL_RATIOS = {
  title: 0.27,
  weight: 0.1,
  flavor: 0.16,
  promos: 0.32,
  price: 0.15,
} as const;

// PDF de promos: layout vertical de tarjetas (no columnas en grilla).
const PROMO_CARD_GAP = 14;
const PROMO_BADGE_H = 36;
const PROMO_ITEM_H = 22;
const PROMO_CARD_PADDING = 10;

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  private readonly logoPath =
    process.env.LOGO_PATH || join(process.cwd(), 'assets', 'logo.png');

  async generateCatalog(products: Product[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        bufferPages: true,
        info: {
          Title: 'Catálogo de Productos — Distribuidora El Hueso',
          Author: 'Distribuidora El Hueso',
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const contentW = pageW - MARGIN * 2;

      const contentTop = HEADER_H + MARGIN;
      const contentBottom = pageH - MARGIN - FOOTER_H;

      // Anchos absolutos de cada columna a partir del ratio configurado.
      const colW = {
        title: contentW * CATALOG_COL_RATIOS.title,
        weight: contentW * CATALOG_COL_RATIOS.weight,
        flavor: contentW * CATALOG_COL_RATIOS.flavor,
        promos: contentW * CATALOG_COL_RATIOS.promos,
        price: contentW * CATALOG_COL_RATIOS.price,
      };

      this.drawCatalogHeader(doc, pageW, contentW);

      if (products.length === 0) {
        doc
          .font('Helvetica')
          .fontSize(11)
          .fillColor(SUBTLE_TEXT)
          .text(
            'No hay productos disponibles en este momento.',
            MARGIN,
            contentTop + 20,
            { width: contentW, align: 'center' },
          );
        this.paintFootersForAllPages(doc, pageW, pageH);
        doc.end();
        return;
      }

      let cursorY = contentTop;
      this.drawCatalogTableHeader(doc, MARGIN, cursorY, colW);
      cursorY += CATALOG_HEAD_H;

      // Paginación con altura variable: cada producto puede ocupar más de
      // una línea según cuántas promos tenga, así que medimos antes de
      // dibujar y abrimos página nueva si no entra.
      for (let i = 0; i < products.length; i++) {
        const rowH = this.measureCatalogRowHeight(products[i]);
        if (cursorY + rowH > contentBottom) {
          doc.addPage();
          this.drawCatalogHeader(doc, pageW, contentW);
          cursorY = contentTop;
          this.drawCatalogTableHeader(doc, MARGIN, cursorY, colW);
          cursorY += CATALOG_HEAD_H;
        }

        this.drawCatalogRow(doc, products[i], MARGIN, cursorY, colW, i, rowH);
        cursorY += rowH;
      }

      this.paintFootersForAllPages(doc, pageW, pageH);
      doc.end();
    });
  }

  private measureCatalogRowHeight(product: Product): number {
    // Una línea base + una extra por cada promo a partir de la primera.
    // (La primera promo se acomoda dentro del padding base sin agregar alto).
    const extra = Math.max(0, product.promos.length - 1) * CATALOG_PROMO_LINE_H;
    return Math.max(CATALOG_ROW_MIN_H, CATALOG_ROW_MIN_H + extra);
  }

  /**
   * Trunca con elipsis manualmente. Usamos esto en columnas estrechas
   * porque la combinación `ellipsis:true + lineBreak:false` de pdfkit
   * a veces decide hacer wrap en lugar de cortar (se observó con títulos
   * y sabores que casi entran).
   * Asume que el font/size ya fueron seteados en el doc.
   */
  private truncateToWidth(
    doc: PDFKit.PDFDocument,
    text: string,
    maxW: number,
  ): string {
    if (doc.widthOfString(text) <= maxW) return text;
    const ellipsis = '…';
    let s = text;
    while (s.length > 0 && doc.widthOfString(s + ellipsis) > maxW) {
      s = s.slice(0, -1);
    }
    return s + ellipsis;
  }

  private drawCatalogTableHeader(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    colW: {
      title: number;
      weight: number;
      flavor: number;
      promos: number;
      price: number;
    },
  ) {
    const totalW =
      colW.title + colW.weight + colW.flavor + colW.promos + colW.price;
    doc.save();
    doc.rect(x, y, totalW, CATALOG_HEAD_H).fill(NAVY);

    const textY = y + 5;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(WHITE);

    let cx = x + 6;
    doc.text('Producto', cx, textY, { width: colW.title - 6, lineBreak: false });
    cx += colW.title;
    doc.text('Presentación', cx, textY, { width: colW.weight, lineBreak: false });
    cx += colW.weight;
    doc.text('Sabor', cx, textY, { width: colW.flavor, lineBreak: false });
    cx += colW.flavor;
    doc.text('Promos', cx, textY, { width: colW.promos, lineBreak: false });
    cx += colW.promos;
    doc.text('Precio', cx, textY, { width: colW.price - 6, align: 'right', lineBreak: false });
    doc.restore();
  }

  private drawCatalogRow(
    doc: PDFKit.PDFDocument,
    product: Product,
    x: number,
    y: number,
    colW: {
      title: number;
      weight: number;
      flavor: number;
      promos: number;
      price: number;
    },
    index: number,
    rowH: number,
  ) {
    const totalW =
      colW.title + colW.weight + colW.flavor + colW.promos + colW.price;
    const isEven = index % 2 === 0;

    // Fondo de fila con banda alternada para legibilidad.
    doc.save();
    doc.rect(x, y, totalW, rowH).fill(isEven ? WHITE : LIGHT_BG);
    doc
      .moveTo(x, y + rowH)
      .lineTo(x + totalW, y + rowH)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    doc.restore();

    const textY = y + CATALOG_ROW_VPAD;

    // Producto (título).
    doc.font('Helvetica-Bold').fontSize(7.5);
    const titleAvailW = Math.max(20, colW.title - 10);
    const titleStr = this.truncateToWidth(doc, product.title, titleAvailW);
    doc
      .fillColor(DARK_TEXT)
      .text(titleStr, x + 6, textY, {
        width: titleAvailW + 5,
        lineBreak: false,
      });

    let cx = x + colW.title;

    // Presentación (weight). Mostramos guion bajo si no hay dato para
    // mantener el grid limpio sin gritarle al lector "FALTANTE".
    doc.font('Helvetica').fontSize(7).fillColor(SUBTLE_TEXT);
    const weightAvailW = Math.max(20, colW.weight - 4);
    doc.text(
      this.truncateToWidth(doc, product.weight || '—', weightAvailW),
      cx,
      textY,
      { width: weightAvailW + 5, lineBreak: false },
    );
    cx += colW.weight;

    // Sabor.
    doc.font('Helvetica').fontSize(7).fillColor(SUBTLE_TEXT);
    const flavorAvailW = Math.max(20, colW.flavor - 4);
    doc.text(
      this.truncateToWidth(doc, product.flavor || '—', flavorAvailW),
      cx,
      textY,
      { width: flavorAvailW + 5, lineBreak: false },
    );
    cx += colW.flavor;

    // Promos: cada promo en su propia línea, en naranja. Si no hay
    // ninguna, dejamos un guion sutil como en el resto de la grilla.
    if (product.promos.length === 0) {
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(SUBTLE_TEXT)
        .text('—', cx, textY, { width: colW.promos, lineBreak: false });
    } else {
      doc.font('Helvetica-Bold').fontSize(7).fillColor(ORANGE);
      const promoAvailW = Math.max(20, colW.promos - 6);
      product.promos.forEach((promo, idx) => {
        const line = this.truncateToWidth(doc, promo.name, promoAvailW);
        doc.text(line, cx, textY + idx * CATALOG_PROMO_LINE_H, {
          width: promoAvailW + 5,
          lineBreak: false,
        });
      });
    }
    cx += colW.promos;

    // Precio (alineado a derecha, negrita navy).
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(NAVY)
      .text(product.salePrice, cx, textY, {
        width: colW.price - 6,
        align: 'right',
        lineBreak: false,
      });
  }

  private drawCatalogHeader(
    doc: PDFKit.PDFDocument,
    pageW: number,
    contentW: number,
  ) {
    this.drawHeader(doc, pageW, contentW);
  }

  // ================================================================
  // HEADER
  // ================================================================

  private drawHeader(
    doc: PDFKit.PDFDocument,
    pageW: number,
    contentW: number,
  ) {
    doc.save();
    doc.rect(0, 0, pageW, HEADER_H).fill(NAVY);

    const hasLogo = existsSync(this.logoPath);
    if (hasLogo) {
      try {
        doc.image(this.logoPath, MARGIN, 6, { height: 52 });
      } catch (err) {
        this.logger.warn('Could not load logo', err);
      }
    }

    const textX = hasLogo ? MARGIN + 70 : MARGIN;
    const textW = contentW - (hasLogo ? 70 : 0);

    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(WHITE)
      .text('DISTRIBUIDORA EL HUESO', textX, 12, { width: textW });

    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(ORANGE)
      .text('Catálogo de Productos', textX, 32, { width: textW });

    const dateStr = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    doc
      .fontSize(7)
      .fillColor('#94a3b8')
      .text(`Actualizado: ${dateStr}`, textX, 46, { width: textW });

    // Accent line
    doc.rect(0, HEADER_H, pageW, 2).fill(ORANGE);
    doc.restore();
  }

  // ================================================================
  // PROMOS PDF — tarjetas verticales con paginación sin cortes
  // ================================================================

  async generatePromos(promos: PromoBlock[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        bufferPages: true,
        info: {
          Title: 'Promociones — Distribuidora El Hueso',
          Author: 'Distribuidora El Hueso',
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const contentW = pageW - MARGIN * 2;

      const contentTop = HEADER_H + MARGIN;
      const contentBottom = pageH - MARGIN - FOOTER_H;
      const usableHeight = contentBottom - contentTop;

      // Máximo de productos que entran en una card respetando el alto de
      // página. Si una promo trae más, la dividimos en chunks que sí entren.
      const cardOverhead = PROMO_BADGE_H + PROMO_CARD_PADDING * 2;
      const maxProductsPerChunk = Math.max(
        1,
        Math.floor((usableHeight - cardOverhead) / PROMO_ITEM_H) - 1,
      );

      this.drawPromosHeader(doc, pageW, contentW);

      if (promos.length === 0) {
        doc
          .font('Helvetica')
          .fontSize(11)
          .fillColor(SUBTLE_TEXT)
          .text(
            'No hay promociones vigentes en este momento. ¡Volvé pronto! 🦴',
            MARGIN,
            contentTop + 20,
            { width: contentW, align: 'center' },
          );
        this.paintFootersForAllPages(doc, pageW, pageH);
        doc.end();
        return;
      }

      // Aplanamos: cada promo grande se divide en sub-cards que sí entren
      // en una página. Las continuaciones llevan sufijo "(cont.)" para que
      // el lector entienda.
      const allCards = promos.flatMap((p) => this.chunkPromo(p, maxProductsPerChunk));

      let cursorY = contentTop;

      for (const card of allCards) {
        const cardH = this.measurePromoCardHeight(card);

        if (cursorY + cardH > contentBottom) {
          doc.addPage();
          this.drawPromosHeader(doc, pageW, contentW);
          cursorY = contentTop;
        }

        this.drawPromoCard(doc, card, MARGIN, cursorY, contentW);
        cursorY += cardH + PROMO_CARD_GAP;
      }

      this.paintFootersForAllPages(doc, pageW, pageH);
      doc.end();
    });
  }

  private chunkPromo(promo: PromoBlock, maxPerChunk: number): PromoBlock[] {
    if (promo.products.length <= maxPerChunk) return [promo];

    const chunks: PromoBlock[] = [];
    for (let i = 0; i < promo.products.length; i += maxPerChunk) {
      const isFirst = i === 0;
      chunks.push({
        ...promo,
        name: isFirst ? promo.name : `${promo.name} (cont.)`,
        products: promo.products.slice(i, i + maxPerChunk),
      });
    }
    return chunks;
  }

  private measurePromoCardHeight(promo: PromoBlock): number {
    // header (badge) + padding interno + filas de productos + padding bottom
    const items = promo.products.length;
    return (
      PROMO_BADGE_H +
      PROMO_CARD_PADDING +
      items * PROMO_ITEM_H +
      PROMO_CARD_PADDING
    );
  }

  private drawPromoCard(
    doc: PDFKit.PDFDocument,
    promo: PromoBlock,
    x: number,
    y: number,
    w: number,
  ) {
    const h = this.measurePromoCardHeight(promo);

    doc.save();

    // Tarjeta: borde + fondo blanco
    doc
      .roundedRect(x, y, w, h, 8)
      .fillAndStroke(WHITE, BORDER);

    // Badge superior (banda navy)
    doc.save();
    doc
      .roundedRect(x, y, w, PROMO_BADGE_H, 8)
      .fill(NAVY);
    // Cubre la parte inferior del rounded para que se vea como banda
    doc.rect(x, y + PROMO_BADGE_H - 8, w, 8).fill(NAVY);
    doc.restore();

    // Nombre de la promo
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(WHITE)
      .text(promo.name, x + 14, y + 10, {
        width: w - 28 - 140,
        lineBreak: false,
        ellipsis: true,
      });

    // Badge del tipo (chip naranja a la derecha)
    const label = formatPromoLabel(promo);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(ORANGE)
      .text(label, x + w - 154, y + 13, {
        width: 140,
        align: 'right',
        lineBreak: false,
        ellipsis: true,
      });

    // Lista de productos
    const listX = x + PROMO_CARD_PADDING;
    const listW = w - PROMO_CARD_PADDING * 2;
    let itemY = y + PROMO_BADGE_H + PROMO_CARD_PADDING;

    promo.products.forEach((prod, idx) => {
      const isEven = idx % 2 === 0;
      doc.save();
      doc
        .rect(listX, itemY, listW, PROMO_ITEM_H)
        .fill(isEven ? WHITE : LIGHT_BG);
      doc.restore();

      const baselineY = itemY + 6;

      // Bullet + título
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(DARK_TEXT)
        .text(`•  ${prod.title}`, listX + 6, baselineY, {
          width: listW - 12 - 120,
          lineBreak: false,
          ellipsis: true,
        });

      // Precio a la derecha
      const priceStr = prod.priceCents > 0 ? formatPrice(prod.priceCents) : '—';
      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(NAVY)
        .text(priceStr, listX + listW - 120 - 6, baselineY, {
          width: 120,
          align: 'right',
          lineBreak: false,
        });

      itemY += PROMO_ITEM_H;
    });

    doc.restore();
  }

  private drawPromosHeader(
    doc: PDFKit.PDFDocument,
    pageW: number,
    contentW: number,
  ) {
    doc.save();
    doc.rect(0, 0, pageW, HEADER_H).fill(NAVY);

    const hasLogo = existsSync(this.logoPath);
    if (hasLogo) {
      try {
        doc.image(this.logoPath, MARGIN, 10, { height: 80 });
      } catch (err) {
        this.logger.warn('Could not load logo', err);
      }
    }

    const textX = hasLogo ? MARGIN + 100 : MARGIN;
    const textW = contentW - (hasLogo ? 100 : 0);

    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor(WHITE)
      .text('DISTRIBUIDORA EL HUESO', textX, 22, { width: textW });

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(ORANGE)
      .text('Promociones vigentes 🔥', textX, 48, { width: textW });

    const dateStr = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    doc
      .fontSize(8)
      .fillColor('#94a3b8')
      .text(`Actualizado: ${dateStr}`, textX, 65, { width: textW });

    doc.rect(0, HEADER_H, pageW, 3).fill(ORANGE);
    doc.restore();
  }

  private paintFootersForAllPages(
    doc: PDFKit.PDFDocument,
    pageW: number,
    pageH: number,
  ) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      this.drawFooter(doc, pageW, pageH, i - range.start + 1, range.count);
    }
  }

  // ================================================================
  // FOOTER
  // ================================================================

  private drawFooter(
    doc: PDFKit.PDFDocument,
    pageW: number,
    pageH: number,
    current: number,
    total: number,
  ) {
    const y = pageH - MARGIN - 10;
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(SUBTLE_TEXT)
      .text(
        `Distribuidora El Hueso — Página ${current} de ${total}`,
        MARGIN,
        y,
        { width: pageW - MARGIN * 2, align: 'center' },
      );
  }
}
