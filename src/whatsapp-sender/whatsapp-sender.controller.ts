import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  BadRequestException,
  ServiceUnavailableException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, firstValueFrom, retry, timeout } from 'rxjs';
import { WHATSAPP_SENDER } from 'src/service/service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
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

  @Get('sessions')
  async getSessions(@Request() req) {
    const userId = req.user.id;

    let sessions = await this.whatsappService.getUserSessions(userId);

    // Si la DB no tiene sesiones activas, consultar el microservicio y auto-registrar
    if (sessions.length === 0) {
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
          // Re-leer desde DB después de registrar
          sessions = await this.whatsappService.getUserSessions(userId);
          this.logger.log(`[SESSIONS] After auto-register, DB sessions: ${JSON.stringify(sessions.map(s => s.sessionId))}`);
        }
      } catch (e) {
        this.logger.warn(`[SESSIONS] Could not query microservice: ${e.message}`);
      }
    }

    // Sincronizar isReady para sesiones activas que aún no están listas
    const syncedSessions = await Promise.all(
      sessions.map(async (session) => {
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
            await this.whatsappService.updateSessionStatus(session.sessionId, true);
            return { ...session, isReady: true };
          }
        } catch {
          // silencioso
        }

        return session;
      }),
    );

    return syncedSessions;
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

    try {
      // Llamar al microservicio
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

      // Actualizar en base de datos
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

  @Post('send')
  async sendMessage(@Body() dto: SendMessageDto, @Request() req) {
    const userId = req.user.id;
    const { sessionId, phone, message } = dto;

    this.logger.log(`User ${userId} sending message via session: ${sessionId}`);

    // Verificar que la sesión está lista antes de enviar
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

    // Registrar actividad
    return this.whatsappService.sendMessage(userId, sessionId, phone, message);
  }
}
