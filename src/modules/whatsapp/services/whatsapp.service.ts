import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  BadGatewayException,
  BadRequestException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { WhatsappSessionRepository } from '../repositories/whatsapp-session.repository';
import { WhatsappSessionEntity } from '../domain/whatsapp-session.entity';
import { ActivityRepository } from '../../users/repositories/activity.repository';
import { ActivityType } from '../../users/domain/activity.entity';
import { MessageLogRepository } from '../repositories/message-log.repository';
import { FailedMessageLogRepository } from '../repositories/failed-message-log.repository';
import { MessageLogResponseDto, FailedMessageLogResponseDto } from '../../../whatsapp-sender/dto/message-log-response.dto';
import { ProviderFactory } from '../providers/provider.factory';

// Service Layer - Lógica de negocio para WhatsApp
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly sessionRepository: WhatsappSessionRepository,
    private readonly activityRepository: ActivityRepository,
    private readonly messageLogRepository: MessageLogRepository,
    private readonly failedMessageLogRepository: FailedMessageLogRepository,
    private readonly httpService: HttpService,
  ) {}

  async createOfficialSession(
    userId: string,
    dto: {
      phoneNumber: string;
      phoneNumberId: string;
      accessToken: string;
      wabaId: string;
    },
  ): Promise<Omit<ReturnType<WhatsappSessionEntity['toJSON']>, 'accessToken'>> {
    // 1. Validate token against Meta Cloud API BEFORE persisting
    try {
      await firstValueFrom(
        this.httpService.get(
          `https://graph.facebook.com/v17.0/me?access_token=${dto.accessToken}`,
        ),
      );
    } catch {
      throw new UnprocessableEntityException('Invalid Meta access token');
    }

    // 2. Persist (repo handles 409 for duplicate phoneNumberId)
    const session = await this.sessionRepository.createOfficialSession({
      userId,
      phoneNumber: dto.phoneNumber,
      phoneNumberId: dto.phoneNumberId,
      accessToken: dto.accessToken,
      wabaId: dto.wabaId,
    });

    // 3. Register activity
    await this.activityRepository.create({
      userId,
      sessionId: session.id,
      type: ActivityType.SESSION_CREATED,
      description: `Sesión oficial de WhatsApp creada: ${dto.phoneNumberId}`,
      metadata: { phoneNumberId: dto.phoneNumberId, wabaId: dto.wabaId },
    });

    this.logger.log(`Official session created: ${session.id}`);

    // Return without accessToken
    return session.toJSON();
  }

  async deleteOfficialSession(userId: string, sessionId: string): Promise<boolean> {
    // Find by DB id (official sessions don't have a sessionId)
    const session = await this.sessionRepository.findById(sessionId);

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    // Verify ownership
    if (session.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para eliminar esta sesión');
    }

    // Delete from DB
    await this.sessionRepository.delete(session.id);

    // Register activity
    await this.activityRepository.create({
      userId,
      sessionId: session.id,
      type: ActivityType.SESSION_DELETED,
      description: `Sesión oficial de WhatsApp eliminada: ${session.phoneNumberId}`,
    });

    this.logger.log(`Official session deleted: ${session.id}`);

    return true;
  }

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

  async findSessionById(id: string): Promise<WhatsappSessionEntity | null> {
    return this.sessionRepository.findById(id);
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

  async bulkSend(
    userId: string,
    sessionId: string,
    phones: string[],
    message: string,
    options?: { templateName?: string; languageCode?: string; templateComponents?: object[] },
  ): Promise<{ total: number; successful: number; failed: number }> {
    // Find session: try by DB id first, then by userId+sessionId
    let session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      session = await this.sessionRepository.findByUserIdAndSessionId(userId, sessionId);
    }

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para usar esta sesión');
    }

    if (session.channelType === 'UNOFFICIAL') {
      throw new BadRequestException(
        'Bulk send for unofficial channel must be handled by the microservice',
      );
    }

    // OFFICIAL channel
    const decryptedToken = this.sessionRepository.decryptAccessToken(session);

    const provider = ProviderFactory.create('OFFICIAL', {
      type: 'OFFICIAL',
      httpService: this.httpService,
      wabaConfig: {
        phoneNumberId: session.phoneNumberId!,
        accessToken: decryptedToken,
        wabaId: session.wabaId!,
      },
    });

    let successful = 0;
    let failed = 0;

    for (let i = 0; i < phones.length; i++) {
      const phone = phones[i];

      try {
        const result = await provider.sendMessage(phone, message, options);

        if (result.success) {
          successful++;
          const messageText = options?.templateName
            ? `[TEMPLATE]${options.templateName}`
            : message;

          try {
            await this.messageLogRepository.create({
              userId,
              sessionId: session.id,
              phone,
              messageText,
              channelType: 'OFFICIAL',
              wamid: result.wamid,
            });
          } catch (logError) {
            this.logger.error(`Failed to persist MessageLog (OFFICIAL bulk): ${logError}`);
          }
        } else {
          failed++;
          try {
            await this.failedMessageLogRepository.create({
              userId,
              sessionId: session.id,
              phone,
              messageText: options?.templateName ? `[TEMPLATE]${options.templateName}` : message,
              failureReason: result.error ?? 'Unknown error',
              channelType: 'OFFICIAL',
            });
          } catch (logError) {
            this.logger.error(`Failed to persist FailedMessageLog (OFFICIAL bulk): ${logError}`);
          }
        }
      } catch (error) {
        failed++;
        try {
          await this.failedMessageLogRepository.create({
            userId,
            sessionId: session.id,
            phone,
            messageText: options?.templateName ? `[TEMPLATE]${options.templateName}` : message,
            failureReason: truncateFailureReason(error),
            channelType: 'OFFICIAL',
          });
        } catch (logError) {
          this.logger.error(`Failed to persist FailedMessageLog (OFFICIAL bulk catch): ${logError}`);
        }
      }

      // Apply 500ms delay between sends, except after the last one
      if (i < phones.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return { total: phones.length, successful, failed };
  }

  async sendMessage(
    userId: string,
    sessionId: string,
    phone: string,
    message: string,
    options?: { templateName?: string; languageCode?: string; templateComponents?: object[] },
  ) {
    // Find session: try by DB id first (official), then by sessionId (unofficial)
    let session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      session = await this.sessionRepository.findByUserIdAndSessionId(userId, sessionId);
    }

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para usar esta sesión');
    }

    const channelType = session.channelType;

    if (channelType === 'OFFICIAL') {
      // Decrypt accessToken in memory only for this call
      const decryptedToken = this.sessionRepository.decryptAccessToken(session);

      const provider = ProviderFactory.create('OFFICIAL', {
        type: 'OFFICIAL',
        httpService: this.httpService,
        wabaConfig: {
          phoneNumberId: session.phoneNumberId!,
          accessToken: decryptedToken,
          wabaId: session.wabaId!,
        },
      });

      const result = await provider.sendMessage(phone, message, options);

      if (result.success) {
        const messageText = options?.templateName
          ? `[TEMPLATE]${options.templateName}`
          : message;

        try {
          await this.messageLogRepository.create({
            userId,
            sessionId: session.id,
            phone,
            messageText,
            channelType: 'OFFICIAL',
            wamid: result.wamid,
          });
        } catch (logError) {
          this.logger.error(`Failed to persist MessageLog (OFFICIAL): ${logError}`);
        }

        return { success: true, wamid: result.wamid };
      } else {
        try {
          await this.failedMessageLogRepository.create({
            userId,
            sessionId: session.id,
            phone,
            messageText: options?.templateName ? `[TEMPLATE]${options.templateName}` : message,
            failureReason: result.error ?? 'Unknown error',
            channelType: 'OFFICIAL',
          });
        } catch (logError) {
          this.logger.error(`Failed to persist FailedMessageLog (OFFICIAL): ${logError}`);
        }

        throw new BadGatewayException(result.error ?? 'Meta API error');
      }
    }

    // UNOFFICIAL channel — existing logic
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
          channelType: 'UNOFFICIAL',
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
          channelType: 'UNOFFICIAL',
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
