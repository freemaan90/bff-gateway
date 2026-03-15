import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { WhatsappSessionRepository } from '../repositories/whatsapp-session.repository';
import { ActivityRepository } from '../../users/repositories/activity.repository';
import { ActivityType } from '../../users/domain/activity.entity';

// Service Layer - Lógica de negocio para WhatsApp
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly sessionRepository: WhatsappSessionRepository,
    private readonly activityRepository: ActivityRepository,
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
    const sessions = await this.sessionRepository.findByUserId(userId);
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

  async updateSessionQr(sessionId: string, qrCode: string, isReady: boolean) {
    const session = await this.sessionRepository.findBySessionId(sessionId);

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    // Actualizar sesión
    const updated = await this.sessionRepository.updateBySessionId(sessionId, {
      lastQrCode: qrCode,
      isReady,
    });

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
}
