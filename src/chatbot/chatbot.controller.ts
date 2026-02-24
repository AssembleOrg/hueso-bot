import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChatbotService } from './chatbot.service';
import { IncomingMessageDto, MessageResponseDto } from './chatbot.dto';

@ApiTags('Chatbot')
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('message')
  @HttpCode(200)
  @ApiOperation({ summary: 'Procesar mensaje entrante del chatbot' })
  @ApiResponse({
    status: 200,
    description: 'Respuesta del chatbot',
    type: MessageResponseDto,
  })
  async handleMessage(@Body() body: IncomingMessageDto): Promise<MessageResponseDto | null> {
    const { jid, text } = body;
    const result = await this.chatbotService.handleMessage(jid, text);

    if (!result) return null;

    return {
      jid,
      response: result.response,
      state: result.newState,
    };
  }
}
