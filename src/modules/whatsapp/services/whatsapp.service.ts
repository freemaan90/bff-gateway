import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { WhatsappSessionRepository } from '../repositories/whatsapp-session.repository';
import { WhatsappSessionEntity } from '../domain/whatsapp-session.entity';
import { ActivityRepository } from '../../users/repositories/activity.repository';
import { ActivityType } from '../../users/domain/activity.entity';
import { MessageLogRepository } from '../repositories/message-log.repository';
import { FailedMessageLogRepository } from '../repositories/failed-message-log.repository';
import { MessageLogResponseDto, FailedMessageLogResponseDto } from '../../../whatsapp-sender/dto/message-log-response.dto';

// Service Layer - Lógica de negocio para WhatsApp
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly sessionRepository: WhatsappSessionRepository,
    private readonly activityRepository: ActivityRepository,
    private readonly messageLogRepository: MessageLogRepository,
    private readonly failedMessageLogRepository: FailedMessageLogRepository,
  ) {}

  async createSession(userId: string, sessionId: string, phoneNumber: string) {
    this.logger.log(`Creating session ${sessionId} for user ${userId}`);

    // Verificar si ya existe
    const existing = await this.sessionRepository.findBySessionId(sessionId);
    if (existing) {
      // Verificar ownership
      if (existing.userId !== userId) {
        throw new ForbiddenException('Esta sesión pertenece a otro usuario');
      }
      // Reactivar si estaba inactiva
      if (!existing.isActive) {
        this.logger.log(`Reactivating existing session ${sessionId}`);
        return this.sessionRepository.update(existing.id, { isActive: true, isReady: false });
      }
      return existing;
    }

    // Crear sesión
    const session = await this.sessionRepository.create({
      sessionId,
      userId,
      phoneNumber,
    });

    // Registrar actividad
    await this.activityRepository.create({
      userId,
      sessionId: session.id,
      type: ActivityType.SESSION_CREATED,
      description: `Sesión de WhatsApp creada: ${sessionId}`,
      metadata: { sessionId, phoneNumber },
    });

    this.logger.log(`Session created successfully: ${session.id}`);

    return session;
  }

  async getUserSessions(userId: string) {
    const sessions = await this.sessionRepository.findActiveByUserId(userId);
    return sessions.map((session) => session.toJSON());
  }

  async getActiveSessions(userId: string) {
    const sessions = await this.sessionRepository.findActiveByUserId(userId);
    return sessions.map((session) => session.toJSON());
  }

  async getSession(userId: string, sessionId: string) {
    const session = await this.sessionRepository.findByUserIdAndSessionId(
      userId,
      sessionId,
    );

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    return session;
  }

  async updateSessionQr(sessionId: string, qrCode: string | null, isReady: boolean) {
    const session = await this.sessionRepository.findBySessionId(sessionId);

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    const updateData: Partial<WhatsappSessionEntity> = { isReady };
    if (qrCode !== null) {
      updateData.lastQrCode = qrCode;
    }

    const updated = await this.sessionRepository.updateBySessionId(sessionId, updateData);

    // Registrar actividad si es un nuevo QR
    if (qrCode && qrCode !== session.lastQrCode) {
      await this.activityRepository.create({
        userId: session.userId,
        sessionId: session.id,
        type: ActivityType.QR_GENERATED,
        description: `QR generado para sesión ${sessionId}`,
      });
    }

    return updated;
  }

  async deleteSession(userId: string, sessionId: string) {
    const session = await this.getSession(userId, sessionId);

    // Marcar como inactiva
    await this.sessionRepository.update(session.id, {
      isActive: false,
    });

    // Registrar actividad
    await this.activityRepository.create({
      userId,
      sessionId: session.id,
      type: ActivityType.SESSION_DELETED,
      description: `Sesión de WhatsApp eliminada: ${sessionId}`,
    });

    this.logger.log(`Session deleted: ${session.id}`);

    return true;
  }

  async getSessionStats(userId: string) {
    const [total, active] = await Promise.all([
      this.sessionRepository.countByUserId(userId),
      this.sessionRepository.countActiveByUserId(userId),
    ]);

    return {
      total,
      active,
      inactive: total - active,
    };
  }

  async updateSessionStatus(sessionId: string, isReady: boolean) {
    const session = await this.sessionRepository.findBySessionId(sessionId);
    if (!session) return;

    await this.sessionRepository.updateBySessionId(sessionId, { isReady });
    this.logger.log(`Session ${sessionId} isReady synced to ${isReady}`);
  }

  async getMessages(userId: string, limit: number): Promise<MessageLogResponseDto[]> {
    const logs = await this.messageLogRepository.findByUserId({ userId, limit });
    return logs.map((log) => ({
      id: log.id,
      phone: log.phone,
      messageText: log.messageText,
      sessionId: log.sessionId,
      sentAt: log.sentAt.toISOString(),
    }));
  }

  async getFailedMessages(userId: string, limit: number): Promise<FailedMessageLogResponseDto[]> {
    const logs = await this.failedMessageLogRepository.findByUserId({ userId, limit });
    return logs.map((log) => ({
      id: log.id,
      phone: log.phone,
      messageText: log.messageText,
      sessionId: log.sessionId,
      failureReason: log.failureReason,
      failedAt: log.failedAt.toISOString(),
    }));
  }

  async sendMessage(userId: string, sessionId: string, phone: string, message: string) {
    // Verificar ownership
    const session = await this.getSession(userId, sessionId);

    try {
      // Registrar actividad (sin guardar contenido del mensaje)
      await this.activityRepository.create({
        userId,
        sessionId: session.id,
        type: ActivityType.MESSAGE_SENT,
        description: `Mensaje enviado a ${phone} desde sesión ${sessionId}`,
      });

      this.logger.log(`Message sent from session ${sessionId} to ${phone}`);

      // Persistir log de mensaje exitoso (fire-and-forget)
      try {
        await this.messageLogRepository.create({
          userId,
          sessionId: session.id,
          phone,
          messageText: message,
        });
      } catch (logError) {
        this.logger.error(`Failed to persist MessageLog: ${logError}`);
      }

      return { success: true };
    } catch (error) {
      // Persistir log de mensaje fallido (fire-and-forget)
      try {
        await this.failedMessageLogRepository.create({
          userId,
          sessionId: session.id,
          phone,
          messageText: message,
          failureReason: truncateFailureReason(error),
        });
      } catch (logError) {
        this.logger.error(`Failed to persist FailedMessageLog: ${logError}`);
      }

      throw error;
    }
  }
}

export function truncateFailureReason(error: unknown): string {
  const msg: string =
    error instanceof Error
      ? error.message
      : String((error as any)?.message ?? error);

  if (msg.includes('La sesión no está lista')) {
    return 'La sesión no está lista';
  }
  if (
    msg.includes('ECONNREFUSED') ||
    msg.includes('timeout') ||
    msg.includes('ServiceUnavailable')
  ) {
    return 'Microservicio no disponible';
  }
  return msg.substring(0, 500);
}
