import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRepository } from '../modules/auth/repositories/user.repository';
import { ActivityRepository } from '../modules/users/repositories/activity.repository';
import { ActivityType } from '../modules/users/domain/activity.entity';

// Service Layer - Contiene la lógica de negocio
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly activityRepository: ActivityRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, name } = registerDto;

    this.logger.log(`Attempting to register user: ${email}`);

    // Verificar si el usuario ya existe
    const existingUser = await this.userRepository.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    // Hash de la contraseña
    const hashedPassword = await this.hashPassword(password);

    // Crear usuario
    const user = await this.userRepository.create({
      email,
      password: hashedPassword,
      name,
    });

    this.logger.log(`User created with ID: ${user.id}`);

    // Registrar actividad
    await this.activityRepository.create({
      userId: user.id,
      type: ActivityType.USER_REGISTERED,
      description: `Usuario registrado: ${email}`,
      metadata: { email, name },
    });

    this.logger.log(`Activity registered for user: ${user.id}`);

    // Generar token
    const token = this.generateToken(user.id, user.email);

    this.logger.log(`User registered successfully: ${user.id}`);

    const response = {
      user: user.toJSON(),
      token,
    };

    this.logger.log(`Sending response: ${JSON.stringify(response)}`);

    return response;
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    this.logger.log(`Login attempt for: ${email}`);

    // Buscar usuario por email primero
    const foundUser = await this.userRepository.findByEmail(email);

    if (!foundUser) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Buscar usuario con contraseña
    const user = await this.userRepository.findByIdWithPassword(foundUser.id);

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Validar contraseña
    const isPasswordValid = await this.validatePassword(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Registrar actividad
    await this.activityRepository.create({
      userId: user.id,
      type: ActivityType.LOGIN_SUCCESS,
      description: 'Usuario inició sesión',
    });

    // Generar token
    const token = this.generateToken(user.id, user.email);

    this.logger.log(`User logged in successfully: ${user.id}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token,
    };
  }

  async validateUser(userId: string) {
    const user = await this.userRepository.findById(userId);
    return user ? user.toJSON() : null;
  }

  // Private helper methods
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  private async validatePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  private generateToken(userId: string, email: string): string {
    const payload = { sub: userId, email };
    return this.jwtService.sign(payload);
  }
}
