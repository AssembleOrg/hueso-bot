import { Module } from '@nestjs/common';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappController } from './whatsapp.controller';

@Module({
  imports: [ChatbotModule],
  controllers: [WhatsappController],
  providers: [WhatsappGateway],
  exports: [WhatsappGateway],
})
export class WhatsappModule {}
