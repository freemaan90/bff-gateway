export enum OAuthSessionStatus {
  PENDING_AUTHORIZATION = 'PENDING_AUTHORIZATION',
  PENDING_WABA_SELECTION = 'PENDING_WABA_SELECTION',
  PENDING_PHONE_SELECTION = 'PENDING_PHONE_SELECTION',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export class OAuthSessionEntity {
  id: string;
  clientId: string;
  state: string;
  pkceVerifier: string;
  encryptedToken?: string;
  wabaId?: string;
  phoneNumberId?: string;
  status: OAuthSessionStatus;
  expiresAt: Date;
  createdAt: Date;

  constructor(data: Partial<OAuthSessionEntity>) {
    Object.assign(this, data);
  }

  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  isOwnedBy(userId: string): boolean {
    return this.clientId === userId;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      clientId: this.clientId,
      state: this.state,
      pkceVerifier: this.pkceVerifier,
      encryptedToken: this.encryptedToken ?? null,
      wabaId: this.wabaId ?? null,
      phoneNumberId: this.phoneNumberId ?? null,
      status: this.status,
      expiresAt: this.expiresAt.toISOString(),
      createdAt: this.createdAt.toISOString(),
    };
  }

  static fromJSON(data: Record<string, unknown>): OAuthSessionEntity {
    return new OAuthSessionEntity({
      id: data['id'] as string,
      clientId: data['clientId'] as string,
      state: data['state'] as string,
      pkceVerifier: data['pkceVerifier'] as string,
      encryptedToken: (data['encryptedToken'] as string | null) ?? undefined,
      wabaId: (data['wabaId'] as string | null) ?? undefined,
      phoneNumberId: (data['phoneNumberId'] as string | null) ?? undefined,
      status: data['status'] as OAuthSessionStatus,
      expiresAt: new Date(data['expiresAt'] as string),
      createdAt: new Date(data['createdAt'] as string),
    });
  }
}
