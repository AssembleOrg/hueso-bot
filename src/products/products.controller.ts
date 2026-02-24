import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { ProductsService } from './products.service';
import { PdfService } from './pdf.service';
import { AdminGuard } from '../whatsapp/admin.guard';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly pdfService: PdfService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos (JSON)' })
  @ApiResponse({ status: 200 })
  async getProducts() {
    return this.productsService.getProducts();
  }

  @Get('catalog.pdf')
  @ApiOperation({ summary: 'Descargar catálogo en PDF' })
  @ApiResponse({ status: 200, description: 'PDF file' })
  async getCatalogPdf(@Res() res: Response) {
    const products = await this.productsService.getProducts();
    const buffer = await this.pdfService.generateCatalog(products);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="catalogo-el-hueso.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('clear-cache')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Limpiar cache de productos (requiere admin)' })
  @ApiQuery({ name: 'key', required: false })
  @ApiResponse({ status: 200 })
  clearCache() {
    this.productsService.clearCache();
    return { message: 'Product cache cleared.' };
  }
}
