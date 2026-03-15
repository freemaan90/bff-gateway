// Domain Entity para WhatsApp Session
export class WhatsappSessionEntity {
  id: string;
  sessionId: string;
  userId: string;
  phoneNumber: string;
  isActive: boolean;
  isReady: boolean;
  lastQrCode?: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Partial<WhatsappSessionEntity>) {
    Object.assign(this, data);
  }

  // Business logic
  canBeDeleted(): boolean {
    return this.isActive;
  }

  needsQrCode(): boolean {
    return this.isActive && !this.isReady;
  }

  getStatus(): SessionStatus {
    if (!this.isActive) return SessionStatus.INACTIVE;
    if (this.isReady) return SessionStatus.CONNECTED;
    return SessionStatus.WAITING_QR;
  }

  getStatusLabel(): string {
    switch (this.getStatus()) {
      case SessionStatus.CONNECTED:
        return 'Conectado';
      case SessionStatus.WAITING_QR:
        return 'Esperando QR';
      case SessionStatus.INACTIVE:
        return 'Inactivo';
    }
  }

  toJSON() {
    return {
      id: this.id,
      sessionId: this.sessionId,
      userId: this.userId,
      phoneNumber: this.phoneNumber,
      isActive: this.isActive,
      isReady: this.isReady,
      lastQrCode: this.lastQrCode,
      status: this.getStatus(),
      statusLabel: this.getStatusLabel(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

export enum SessionStatus {
  CONNECTED = 'connected',
  WAITING_QR = 'waiting_qr',
  INACTIVE = 'inactive',
}
