import { Module } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { SessionStoreService } from './session-store.service';
import { StandbyService } from './standby.service';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [ChatbotController],
  providers: [ChatbotService, SessionStoreService, StandbyService],
  exports: [ChatbotService, SessionStoreService, StandbyService],
})
export class ChatbotModule {}
