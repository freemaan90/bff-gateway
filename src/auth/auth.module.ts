import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { envs } from '../config/envs';
import { UserRepository } from '../modules/auth/repositories/user.repository';
import { ActivityRepository } from '../modules/users/repositories/activity.repository';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: envs.JWT_SECRET,
      signOptions: { expiresIn: envs.JWT_EXPIRES_IN },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, UserRepository, ActivityRepository],
  exports: [AuthService, UserRepository],
})
export class AuthModule {}
