import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { existsSync } from 'fs';
import { join } from 'path';
import { Product } from './product.interface';

const NAVY = '#1B2A4A';
const ORANGE = '#E8842C';
const LIGHT_BG = '#F8F9FA';
const WHITE = '#FFFFFF';
const DARK_TEXT = '#1a1a1a';
const SUBTLE_TEXT = '#6b7280';
const BORDER = '#E5E7EB';

const MARGIN = 40;
const ROW_H = 20;
const HEADER_H = 100;
const FOOTER_H = 30;
const COL_GAP = 16;

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

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const contentW = pageW - MARGIN * 2;
      const colW = (contentW - COL_GAP) / 2;
      const usableH = pageH - MARGIN - HEADER_H - FOOTER_H;
      const rowsPerCol = Math.floor(usableH / ROW_H);
      const rowsPerPage = rowsPerCol * 2; // 2 columns

      const totalPages = Math.ceil(products.length / rowsPerPage);

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) doc.addPage();

        this.drawHeader(doc, pageW, contentW);
        this.drawFooter(doc, pageW, pageH, page + 1, totalPages);

        const pageProducts = products.slice(
          page * rowsPerPage,
          (page + 1) * rowsPerPage,
        );

        // Split into left and right columns
        const leftCol = pageProducts.slice(0, rowsPerCol);
        const rightCol = pageProducts.slice(rowsPerCol);
        const globalOffset = page * rowsPerPage;

        this.drawColumn(doc, leftCol, MARGIN, HEADER_H + MARGIN, colW, globalOffset);
        this.drawColumn(doc, rightCol, MARGIN + colW + COL_GAP, HEADER_H + MARGIN, colW, globalOffset + rowsPerCol);
      }

      doc.end();
    });
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
      .text('Catálogo de Productos', textX, 48, { width: textW });

    const dateStr = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    doc
      .fontSize(8)
      .fillColor('#94a3b8')
      .text(`Actualizado: ${dateStr}`, textX, 65, { width: textW });

    // Accent line
    doc.rect(0, HEADER_H, pageW, 3).fill(ORANGE);
    doc.restore();
  }

  // ================================================================
  // COLUMN (draws a list of products in a single column)
  // ================================================================

  private drawColumn(
    doc: PDFKit.PDFDocument,
    items: Product[],
    x: number,
    startY: number,
    colW: number,
    globalStart: number,
  ) {
    items.forEach((product, i) => {
      const y = startY + i * ROW_H;
      const isEven = (globalStart + i) % 2 === 0;

      // Row background
      doc.save();
      doc.rect(x, y, colW, ROW_H).fill(isEven ? WHITE : LIGHT_BG);
      // Bottom border
      doc
        .moveTo(x, y + ROW_H)
        .lineTo(x + colW, y + ROW_H)
        .strokeColor(BORDER)
        .lineWidth(0.5)
        .stroke();
      doc.restore();

      const textY = y + 5;

      // Number
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(SUBTLE_TEXT)
        .text(String(globalStart + i + 1) + '.', x + 6, textY, {
          width: 22,
          align: 'right',
        });

      // Product name
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(DARK_TEXT)
        .text(product.title, x + 32, textY, {
          width: colW - 38,
          lineBreak: false,
          ellipsis: true,
        });
    });
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
