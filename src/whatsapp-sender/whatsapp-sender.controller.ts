import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  ServiceUnavailableException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, firstValueFrom, retry } from 'rxjs';
import { WHATSAPP_SENDER } from 'src/service/service';
import { CreateSessionDto } from './dto/create-session.dto';
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
    this.logger.log(`User ${userId} requesting sessions`);

    return this.whatsappService.getUserSessions(userId);
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
    const userId = req.user.id;

    // Verificar que la sesión pertenece al usuario
    await this.whatsappService.getSession(userId, sessionId);

    this.logger.log(`User ${userId} checking status for session: ${sessionId}`);

    try {
      const result = await firstValueFrom(
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

      // Actualizar QR en base de datos si cambió
      if (result?.qrBase64) {
        await this.whatsappService.updateSessionQr(
          sessionId,
          result.qrBase64,
          result.isReady || false,
        );
      }

      return result;
    } catch (error) {
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
}
