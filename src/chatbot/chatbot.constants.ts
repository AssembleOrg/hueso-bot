export const MESSAGES = {
  MAIN_MENU: [
    '*Distribuidora El Hueso* 🦴✨',
    '¿Qué necesitás?\n',
    '1️⃣ Sobre nosotros',
    '2️⃣ Listado de productos 📦',
    '3️⃣ Promociones 🔥',
    '4️⃣ Realizar pedido 🛒',
    '5️⃣ Hablar con representante 🧑‍💼\n',
    '9️⃣ Finalizar',
  ].join('\n'),

  REPRESENTATIVE_ACK: [
    '🧑‍💼 *Dejá tu consulta acá* y te atenderemos a la brevedad.',
    '',
    'A partir de este momento un representante se hará cargo de la conversación.',
  ].join('\n'),

  ABOUT_US: [
    '🦴 *Distribuidora El Hueso*',
    'Somos una distribuidora enfocada en entregas y atención rápida.',
    'Contanos qué estás buscando y te ayudamos a armar el pedido. 📦🛒',
  ].join('\n'),

  PRODUCTS_EMPTY:
    '📦 No hay productos disponibles en este momento. Volvé a intentar más tarde.',

  PRODUCTS_ERROR:
    '❌ No se pudo obtener el listado. Intente más tarde.',

  ORDER_LINK: (url: string) =>
    `🛒 *Hacé tu pedido desde acá:*\n\n${url}\n\n⏳ El link es válido por 30 minutos.`,

  FAREWELL: '¡Gracias por comunicarte con Distribuidora El Hueso! 🦴👋',

  INVALID_OPTION:
    '❌ Opción inválida. Elegí una opción del menú (1️⃣, 2️⃣, 3️⃣, 4️⃣, 5️⃣ o 9️⃣).',

  INVALID_STATE: '❌ Ocurrió un error de estado. Escribí cualquier cosa para reiniciar. 🔄',
} as const;

export const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Standby cuando el cliente pide hablar con un humano: 1 hora.
// Cada "ida y vuelta" entre cliente y representante extiende +15min en backend
// (cap absoluto 4h desde el inicio — definido en backend).
export const STANDBY_TTL_SECONDS = 60 * 60;
