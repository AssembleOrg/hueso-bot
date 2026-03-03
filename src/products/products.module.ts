import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PdfService } from './pdf.service';
import { ProductSyncService } from './product-sync.service';
import { ProductsController } from './products.controller';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, PdfService, ProductSyncService],
  exports: [ProductsService, PdfService, ProductSyncService],
})
export class ProductsModule {}
