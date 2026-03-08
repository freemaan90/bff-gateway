import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { WHATSAPP_SENDER } from './service/service';
import { envs } from './config/envs';
import { HealthModule } from './health/health.module';
import { WhatsappSenderModule } from './whatsapp-sender/whatsapp-sender.module';

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
    HealthModule,
    WhatsappSenderModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
