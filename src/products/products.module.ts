import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PdfService } from './pdf.service';
import { PromosClientService } from './promos-client.service';
import { ProductsController } from './products.controller';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, PdfService, PromosClientService],
  exports: [ProductsService, PdfService, PromosClientService],
})
export class ProductsModule {}
