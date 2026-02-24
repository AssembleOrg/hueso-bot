import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductsModule } from './products/products.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { KeepAliveModule } from './keep-alive/keep-alive.module';
import { AuthCleanupModule } from './auth-cleanup/auth-cleanup.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ProductsModule,
    ChatbotModule,
    WhatsappModule,
    KeepAliveModule,
    AuthCleanupModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
