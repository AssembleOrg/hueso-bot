import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PdfService } from './pdf.service';
import { ProductsController } from './products.controller';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, PdfService],
  exports: [ProductsService, PdfService],
})
export class ProductsModule {}
