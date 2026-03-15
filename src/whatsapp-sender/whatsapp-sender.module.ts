import { Module } from '@nestjs/common';
import { WhatsappSenderController } from './whatsapp-sender.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { WHATSAPP_SENDER } from 'src/service/service';
import { envs } from 'src/config/envs';
import { WhatsappModule } from '../modules/whatsapp/whatsapp.module';

@Module({
  imports: [
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
    WhatsappModule,
  ],
  controllers: [WhatsappSenderController],
  providers: [],
})
export class WhatsappSenderModule {}
