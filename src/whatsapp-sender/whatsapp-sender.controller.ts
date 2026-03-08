import {
  Controller,
  Get,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, firstValueFrom, retry } from 'rxjs';
import { WHATSAPP_SENDER } from 'src/service/service';

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
}
