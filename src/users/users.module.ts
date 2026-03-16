import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ActivityRepository } from '../modules/users/repositories/activity.repository';
import { WhatsappSessionRepository } from '../modules/whatsapp/repositories/whatsapp-session.repository';
import { EncryptionModule } from '../common/encryption/encryption.module';

@Module({
  imports: [EncryptionModule],
  controllers: [UsersController],
  providers: [UsersService, ActivityRepository, WhatsappSessionRepository],
  exports: [UsersService, ActivityRepository],
})
export class UsersModule {}
