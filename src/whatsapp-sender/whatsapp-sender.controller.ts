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
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, firstValueFrom, retry } from 'rxjs';
import { WHATSAPP_SENDER } from 'src/service/service';
import { CreateSessionDto } from './dto/create-session.dto';

@Controller('whatsapp-sender')
export class WhatsappSenderController {
  private readonly logger = new Logger(WhatsappSenderController.name);

  constructor(
    @Inject(WHATSAPP_SENDER)
    private readonly whatsappSenderClient: ClientProxy,
  ) {}

  @Get('health')
  async whatsAppSenderHealth() {
    this.logger.log(`Sending healthCheck to ${WhatsappSenderController.name}`);

    try {
      const result = await firstValueFrom(
        this.whatsappSenderClient
          .send({ cmd: 'whatsapp_sender_health' }, {})
          .pipe(
            retry(3),
            catchError((error) => {
              this.logger.error(
                `Failed to fetch whatsapp-sender: ${error.message}`,
              );
              throw error;
            }),
          ),
      );

      this.logger.log(`Health check OK for ${WhatsappSenderController.name}`);

      return result;
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'down',
        service: 'whatsapp-sender',
        message: 'Microservice unavailable',
      });
    }
  }

  @Get(`sessions`)
  async whatsappSenderSessions() {
    this.logger.log(
      `Sending request list all sessions to ${WhatsappSenderController.name}`,
    );

    try {
      const result = await firstValueFrom(
        this.whatsappSenderClient
          .send({ cmd: 'whatsapp_sender_sessions' }, {})
          .pipe(
            retry(3),
            catchError((error) => {
              this.logger.error(
                `Failed to fetch whatsapp-sender-sessions: ${error.message}`,
              );
              throw error;
            }),
          ),
      );

      this.logger.log(
        `whatsapp sender sessions OK ${WhatsappSenderController.name}`,
      );

      return result;
    } catch (error) {}
  }

  @Post(`session`)
  async whatsappSenderSessionCreate(@Body() {sessionId}:CreateSessionDto) {
    this.logger.log(
      `Sending whatsapp_sender_create_session: ${sessionId} to ${WhatsappSenderController.name}`,
    );

    try {
      const result = await firstValueFrom(
        this.whatsappSenderClient
          .send({ cmd: 'whatsapp_sender_create_session' }, {sessionId})
          .pipe(
            retry(3),
            catchError((error) => {
              this.logger.error(
                `Failed to fetch whatsapp_sender_create_session: ${error.message}`,
              );
              throw error;
            }),
          ),
      );

      this.logger.log(
        `whatsapp_sender_create_session OK ${WhatsappSenderController.name}`,
      );

      return result;
    } catch (error) {}
  }

  @Get(`status/:sessionId`)
  async getSessionStatusById(@Param(`sessionId`) sessionId: string){
        this.logger.log(
      `Sending whatsapp_sender_session_status: ${sessionId} to ${WhatsappSenderController.name}`,
    );

    try {
      const result = await firstValueFrom(
        this.whatsappSenderClient
          .send({ cmd: 'whatsapp_sender_session_status' }, {sessionId})
          .pipe(
            retry(3),
            catchError((error) => {
              this.logger.error(
                `Failed to fetch whatsapp_sender_session_status: ${error.message}`,
              );
              throw error;
            }),
          ),
      );

      this.logger.log(
        `whatsapp_sender_session_status OK ${WhatsappSenderController.name}`,
      );

      return result;
    } catch (error) {}
  }

  @Delete(`session`)
  async whatsappSenderSessionDelete(@Body() {sessionId}:CreateSessionDto){
        this.logger.log(
      `Sending request to delete session: ${sessionId} ${WhatsappSenderController.name}`,
    );

    try {
      const result = await firstValueFrom(
        this.whatsappSenderClient
          .send({ cmd: 'whatsapp_sender_delete_session' }, {sessionId})
          .pipe(
            retry(3),
            catchError((error) => {
              this.logger.error(
                `Failed to fetch whatsapp_sender_delete_session: ${error.message}`,
              );
              throw error;
            }),
          ),
      );

      this.logger.log(
        `whatsapp_sender_delete_session OK ${WhatsappSenderController.name}`,
      );

      return result;
    } catch (error) {}
  }
}
