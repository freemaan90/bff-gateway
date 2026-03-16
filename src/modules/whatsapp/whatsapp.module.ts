import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { WHATSAPP_SENDER } from '../../service/service';
import { envs } from '../../config/envs';
import { WhatsappService } from './services/whatsapp.service';
import { WhatsappSessionRepository } from './repositories/whatsapp-session.repository';
import { ActivityRepository } from '../users/repositories/activity.repository';
import { MessageLogRepository } from './repositories/message-log.repository';
import { FailedMessageLogRepository } from './repositories/failed-message-log.repository';
import { EncryptionModule } from '../../common/encryption/encryption.module';

@Module({
  imports: [
    HttpModule,
    EncryptionModule,
    ClientsModule.register([
      {
        name: WHATSAPP_SENDER,
        transport: Transport.TCP,
        options: {
          host: envs.BFF_WHATSAPP_SENDER_HOST,
          port: envs.BFF_WHATSAPP_SENDER_PORT,
        },
      },
    ]),
  ],
  providers: [
    WhatsappService,
    WhatsappSessionRepository,
    ActivityRepository,
    MessageLogRepository,
    FailedMessageLogRepository,
  ],
  exports: [WhatsappService, WhatsappSessionRepository],
})
export class WhatsappModule {}
