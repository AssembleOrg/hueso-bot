export enum SessionState {
  PAUSED = 'PAUSED',
  MAIN_MENU = 'MAIN_MENU',
  PRODUCTS_MENU = 'PRODUCTS_MENU',
  PROMOTIONS_MENU = 'PROMOTIONS_MENU',
}

export interface UserSession {
  jid: string;
  state: SessionState;
  lastInteractionAt: Date;
  metadata: Record<string, any>;
}

export interface Attachment {
  buffer: Buffer;
  mimetype: string;
  filename: string;
  caption?: string;
}

export interface RouteResult {
  response: string;
  newState: SessionState;
  attachment?: Attachment;
}
