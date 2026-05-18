import { ApiProperty } from '@nestjs/swagger';

export class IncomingMessageDto {
  @ApiProperty({
    description: 'WhatsApp JID del usuario',
    example: '5491112345678@s.whatsapp.net',
  })
  jid: string;

  @ApiProperty({
    description: 'Texto del mensaje entrante',
    example: '/starthueso',
  })
  text: string;

  @ApiProperty({
    description:
      'true si el mensaje lo envió el propio número del bot (representante respondiendo desde su WhatsApp).',
    required: false,
    example: false,
  })
  fromMe?: boolean;
}

export class MessageResponseDto {
  @ApiProperty({
    description: 'WhatsApp JID del usuario',
    example: '5491112345678@s.whatsapp.net',
  })
  jid: string;

  @ApiProperty({
    description: 'Respuesta del chatbot',
    example: '*Distribuidora El Hueso* 🦴✨\n¿Qué necesitás?\n\n1) Sobre nosotros\n2) Listado de productos 📦\n3) Promociones 🔥\n4) Realizar pedido 🛒\n\n9) Finalizar',
  })
  response: string;

  @ApiProperty({
    description: 'Nuevo estado de la sesión',
    example: 'MAIN_MENU',
    enum: ['PAUSED', 'MAIN_MENU'],
  })
  state: string;
}
