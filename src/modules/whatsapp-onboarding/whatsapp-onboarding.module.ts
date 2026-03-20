import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../prisma/prisma.module';
import { EncryptionModule } from '../../common/encryption/encryption.module';
import { WhatsappOnboardingController } from './whatsapp-onboarding.controller';
import { WhatsappOnboardingService } from './services/whatsapp-onboarding.service';
import { MetaGraphApiService } from './services/meta-graph-api.service';
import { OAuthSessionRepository } from './repositories/oauth-session.repository';

@Module({
  imports: [HttpModule, PrismaModule, EncryptionModule],
  controllers: [WhatsappOnboardingController],
  providers: [WhatsappOnboardingService, MetaGraphApiService, OAuthSessionRepository],
})
export class WhatsappOnboardingModule {}
