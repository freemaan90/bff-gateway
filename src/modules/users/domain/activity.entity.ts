// Domain Entity para Activity
export class ActivityEntity {
  id: string;
  userId: string;
  sessionId?: string;
  type: ActivityType;
  description: string;
  metadata?: Record<string, any>;
  createdAt: Date;

  constructor(data: Partial<ActivityEntity>) {
    Object.assign(this, data);
  }

  isRecent(): boolean {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return this.createdAt > hourAgo;
  }

  getRelativeTime(): string {
    const now = new Date();
    const diffMs = now.getTime() - this.createdAt.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    return this.createdAt.toLocaleDateString('es-AR');
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      sessionId: this.sessionId,
      type: this.type,
      description: this.description,
      metadata: this.metadata,
      createdAt: this.createdAt,
      relativeTime: this.getRelativeTime(),
    };
  }
}

export enum ActivityType {
  SESSION_CREATED = 'session_created',
  SESSION_DELETED = 'session_deleted',
  MESSAGE_SENT = 'message_sent',
  QR_GENERATED = 'qr_generated',
  LOGIN_SUCCESS = 'login_success',
  USER_REGISTERED = 'user_registered',
}
