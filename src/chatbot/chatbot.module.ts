import { Module } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { SessionStoreService } from './session-store.service';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [ChatbotController],
  providers: [ChatbotService, SessionStoreService],
  exports: [ChatbotService, SessionStoreService],
})
export class ChatbotModule {}
