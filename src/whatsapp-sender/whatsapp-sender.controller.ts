import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  BadRequestException,
  ServiceUnavailableException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, firstValueFrom, retry, timeout } from 'rxjs';
import { WHATSAPP_SENDER } from 'src/service/service';
import { CreateSessionDto } from './dto/create-session.dto';
import { CreateOfficialSessionDto } from './dto/create-official-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { BulkSendDto } from './dto/bulk-send.dto';
import { MessageLogResponseDto, FailedMessageLogResponseDto } from './dto/message-log-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WhatsappService } from '../modules/whatsapp/services/whatsapp.service';

@Controller('whatsapp-sender')
@UseGuards(JwtAuthGuard)
export class WhatsappSenderController {
  private readonly logger = new Logger(WhatsappSenderController.name);

  constructor(
    @Inject(WHATSAPP_SENDER)
    private readonly whatsappSenderClient: ClientProxy,
    private readonly whatsappService: WhatsappService,
  ) {}

  @Get('health')
  async whatsAppSenderHealth() {
    this.logger.log(`Health check for WhatsApp Sender`);

    try {
      const result = await firstValueFrom(
        this.whatsappSenderClient
          .send({ cmd: 'whatsapp_sender_health' }, {})
          .pipe(
            retry(3),
            catchError((error) => {
              this.logger.error(`Health check failed: ${error.message}`);
              throw error;
            }),
          ),
      );

      this.logger.log(`Health check OK`);
      return result;
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'down',
        service: 'whatsapp-sender',
        message: 'Microservice unavailable',
      });
    }
  }

  @Post('sessions/official')
  async createOfficialSession(@Body() dto: CreateOfficialSessionDto, @Request() req) {
    const userId = req.user.id;
    return this.whatsappService.createOfficialSession(userId, dto);
  }

  @Get('sessions')
  async getSessions(@Request() req) {
    const userId = req.user.id;

    const allSessions = await this.whatsappService.getUserSessions(userId);

    // Separate official and unofficial sessions
    const officialSessions = allSessions.filter((s) => s.channelType === 'OFFICIAL');
    const unofficialSessions = allSessions.filter((s) => s.channelType !== 'OFFICIAL');

    // For unofficial sessions: apply existing sync logic with microservice
    let syncedUnofficial = unofficialSessions;

    // If no unofficial sessions in DB, try to auto-register from microservice
    if (unofficialSessions.length === 0) {
      try {
        const microSessions: any[] = await firstValueFrom(
          this.whatsappSenderClient
            .send({ cmd: 'whatsapp_sender_sessions' }, {})
            .pipe(
              timeout(5000),
              catchError((err) => { throw new Error(err?.message ?? 'unavailable'); }),
            ),
        );

        this.logger.log(`[SESSIONS] Microservice sessions: ${JSON.stringify(microSessions)}`);

        const readySessions = (microSessions ?? []).filter((ms) => ms.isReady);

        if (readySessions.length > 0) {
          for (const ms of readySessions) {
            await this.whatsappService.createSession(userId, ms.sessionId, ms.sessionId);
            await this.whatsappService.updateSessionStatus(ms.sessionId, true);
          }
          // Re-read from DB after registering
          const refreshed = await this.whatsappService.getUserSessions(userId);
          syncedUnofficial = refreshed.filter((s) => s.channelType !== 'OFFICIAL');
          this.logger.log(`[SESSIONS] After auto-register, unofficial sessions: ${JSON.stringify(syncedUnofficial.map(s => s.sessionId))}`);
        }
      } catch (e) {
        this.logger.warn(`[SESSIONS] Could not query microservice: ${e.message}`);
      }
    }

    // Sync isReady for unofficial sessions not yet ready
    syncedUnofficial = await Promise.all(
      syncedUnofficial.map(async (session) => {
        if (!session.isActive || session.isReady) return session;

        try {
          const status = await firstValueFrom(
            this.whatsappSenderClient
              .send({ cmd: 'whatsapp_sender_session_status' }, { sessionId: session.sessionId })
              .pipe(
                timeout(5000),
                catchError(() => { throw new Error('unavailable'); }),
              ),
          );

          if (status?.isReady) {
            await this.whatsappService.updateSessionStatus(session.sessionId!, true);
            return { ...session, isReady: true };
          }
        } catch {
          // silencioso
        }

        return session;
      }),
    );

    // Official sessions are always isReady=true, no microservice sync needed
    return [...officialSessions, ...syncedUnofficial];
  }

  @Post('session')
  async createSession(@Body() { sessionId }: CreateSessionDto, @Request() req) {
    const userId = req.user.id;

    this.logger.log(`User ${userId} creating session: ${sessionId}`);

    try {
      // Llamar al microservicio para crear la sesión
      const result = await firstValueFrom(
        this.whatsappSenderClient
          .send({ cmd: 'whatsapp_sender_create_session' }, { sessionId })
          .pipe(
            retry(3),
            catchError((error) => {
              this.logger.error(`Failed to create session: ${error.message}`);
              throw error;
            }),
          ),
      );

      // Guardar en base de datos
      await this.whatsappService.createSession(userId, sessionId, sessionId);

      this.logger.log(`Session created successfully for user ${userId}`);

      return result;
    } catch (error) {
      throw error;
    }
  }

  @Get('status/:sessionId')
  async getSessionStatus(@Param('sessionId') sessionId: string, @Request() req) {
    try {
      const result = await firstValueFrom(
        this.whatsappSenderClient
          .send({ cmd: 'whatsapp_sender_session_status' }, { sessionId })
          .pipe(
            retry(3),
            catchError((error) => {
              this.logger.error(`[STATUS] Failed to fetch session status: ${error.message}`);
              throw error;
            }),
          ),
      );

      if (!result) return null;

      this.logger.log(`[STATUS] ${sessionId}: isReady=${result.isReady}, hasQr=${!!result.qrBase64}`);

      // Actualizar DB si la sesión existe (puede no estar aún en auto-registro)
      try {
        await this.whatsappService.updateSessionQr(
          sessionId,
          result.qrBase64 || null,
          result.isReady || false,
        );
      } catch {
        // sesión no en DB aún, ignorar
      }

      return result;
    } catch (error) {
      this.logger.error(`[STATUS] Error for ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  @Delete('session')
  async deleteSession(@Body() { sessionId }: CreateSessionDto, @Request() req) {
    const userId = req.user.id;

    this.logger.log(`User ${userId} deleting session: ${sessionId}`);

    // Determine channelType: try to find by DB id first (official), then by sessionId (unofficial)
    const sessionById = await this.whatsappService.findSessionById(sessionId);

    if (sessionById && sessionById.channelType === 'OFFICIAL') {
      // Official session: only delete from DB, no microservice call
      await this.whatsappService.deleteOfficialSession(userId, sessionId);
      this.logger.log(`Official session deleted for user ${userId}`);
      return { success: true };
    }

    // Unofficial session: call microservice + DB
    try {
      const result = await firstValueFrom(
        this.whatsappSenderClient
          .send({ cmd: 'whatsapp_sender_delete_session' }, { sessionId })
          .pipe(
            retry(3),
            catchError((error) => {
              this.logger.error(`Failed to delete session: ${error.message}`);
              throw error;
            }),
          ),
      );

      await this.whatsappService.deleteSession(userId, sessionId);

      this.logger.log(`Session deleted successfully for user ${userId}`);

      return result;
    } catch (error) {
      throw error;
    }
  }

  @Get('stats')
  async getStats(@Request() req) {
    const userId = req.user.id;
    return this.whatsappService.getSessionStats(userId);
  }

  @Get('messages/failed')
  async getFailedMessages(
    @Request() req,
    @Query('limit') limitStr?: string,
  ): Promise<FailedMessageLogResponseDto[]> {
    const userId = req.user.id;
    const parsed = parseInt(limitStr ?? '', 10);
    const limit = !isNaN(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 50;
    return this.whatsappService.getFailedMessages(userId, limit);
  }

  @Get('messages')
  async getMessages(
    @Request() req,
    @Query('limit') limitStr?: string,
  ): Promise<MessageLogResponseDto[]> {
    const userId = req.user.id;
    const parsed = parseInt(limitStr ?? '', 10);
    const limit = !isNaN(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 50;
    return this.whatsappService.getMessages(userId, limit);
  }

  @Post('send')
  async sendMessage(@Body() dto: SendMessageDto, @Request() req) {
    const userId = req.user.id;
    const { sessionId, phone, message, templateName, languageCode, templateComponents } = dto;

    this.logger.log(`User ${userId} sending message via session: ${sessionId}`);

    // Determine channelType: try to find by DB id first (official), then treat as unofficial
    const sessionById = await this.whatsappService.findSessionById(sessionId);
    const isOfficial = sessionById?.channelType === 'OFFICIAL';

    if (isOfficial) {
      // Official channel: call service directly, no TCP check
      return this.whatsappService.sendMessage(userId, sessionId, phone, message ?? '', {
        templateName,
        languageCode,
        templateComponents,
      });
    }

    // Unofficial channel: verify TCP status, send via microservice, then log
    let status: any;
    try {
      status = await firstValueFrom(
        this.whatsappSenderClient
          .send({ cmd: 'whatsapp_sender_session_status' }, { sessionId })
          .pipe(
            retry(3),
            catchError((error) => {
              this.logger.error(`Failed to fetch session status: ${error.message}`);
              throw error;
            }),
          ),
      );
    } catch {
      throw new ServiceUnavailableException('No se pudo verificar el estado de la sesión');
    }

    if (!status?.isReady) {
      throw new BadRequestException('La sesión no está lista para enviar mensajes');
    }

    // Enviar mensaje al microservicio
    await firstValueFrom(
      this.whatsappSenderClient
        .send({ cmd: 'whatsapp_sender_send_message' }, { sessionId, phone, message })
        .pipe(
          catchError((error) => {
            this.logger.error(`Failed to send message: ${error.message}`);
            throw error;
          }),
        ),
    );

    // Registrar actividad y log
    return this.whatsappService.sendMessage(userId, sessionId, phone, message ?? '');
  }

  @Post('bulk-send')
  async bulkSend(@Body() dto: BulkSendDto, @Request() req) {
    const userId = req.user.id;
    const { sessionId, phones, message, templateName, languageCode, templateComponents } = dto;

    // Determine channelType
    const session = await this.whatsappService.findSessionById(sessionId);
    const isOfficial = session?.channelType === 'OFFICIAL';

    if (isOfficial) {
      return this.whatsappService.bulkSend(userId, sessionId, phones, message ?? '', {
        templateName,
        languageCode,
        templateComponents,
      });
    }

    // Unofficial: delegate to microservice (existing behavior)
    return firstValueFrom(
      this.whatsappSenderClient
        .send({ cmd: 'whatsapp_sender_bulk_send' }, { sessionId, phones, message })
        .pipe(
          catchError((error) => {
            this.logger.error(`Failed bulk send: ${error.message}`);
            throw error;
          }),
        ),
    );
  }
}
