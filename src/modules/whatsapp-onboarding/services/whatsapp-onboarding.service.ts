import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { ChannelType } from '@prisma/client';
import { envs } from '../../../config/envs';
import { EncryptionService } from '../../../common/encryption/encryption.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OAuthSessionRepository } from '../repositories/oauth-session.repository';
import { AuthorizeResponseDto } from '../dto/authorize-response.dto';
import { CallbackQueryDto } from '../dto/callback-query.dto';
import { CallbackResultDto } from '../dto/callback-result.dto';
import { SelectWabaDto } from '../dto/select-waba.dto';
import { SelectPhoneDto } from '../dto/select-phone.dto';
import { MetaGraphApiService } from './meta-graph-api.service';
import { OAuthSessionEntity, OAuthSessionStatus } from '../domain/oauth-session.entity';

@Injectable()
export class WhatsappOnboardingService {
  constructor(
    private readonly oAuthSessionRepository: OAuthSessionRepository,
    private readonly metaGraphApiService: MetaGraphApiService,
    private readonly encryptionService: EncryptionService,
    private readonly prisma: PrismaService,
  ) {}

  async authorize(userId: string): Promise<AuthorizeResponseDto> {
    // Req 1.7: Invalidar sesión activa previa si existe
    const existingSession =
      await this.oAuthSessionRepository.findActiveByUserId(userId);
    if (existingSession) {
      await this.oAuthSessionRepository.deleteByUserId(userId);
    }

    // Req 1.1, 8.2: Generar state con 256 bits de entropía criptográfica
    const state = crypto.randomBytes(32).toString('base64url');

    // Req 1.1, 8.1: Generar PKCE verifier (43+ chars)
    const pkceVerifier = crypto.randomBytes(32).toString('base64url');

    // Req 1.2: Calcular PKCE challenge = SHA-256(verifier) en Base64URL sin padding
    const pkceChallenge = crypto
      .createHash('sha256')
      .update(pkceVerifier)
      .digest('base64url');

    // Req 1.3, 8.4: Persistir OAuthSession con TTL de 10 minutos
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.oAuthSessionRepository.create({
      clientId: userId,
      state,
      pkceVerifier,
      expiresAt,
    });

    // Req 1.4: Construir URL de autorización con todos los parámetros requeridos
    const params = new URLSearchParams({
      client_id: envs.metaAppId,
      redirect_uri: envs.metaRedirectUri,
      scope: 'whatsapp_business_management,whatsapp_business_messaging',
      state,
      code_challenge: pkceChallenge,
      code_challenge_method: 'S256',
    });

    const authorizationUrl = `https://www.facebook.com/dialog/oauth?${params.toString()}`;

    // Req 1.5: Retornar la URL de autorización
    return { authorizationUrl };
  }

  async handleCallback(query: CallbackQueryDto): Promise<CallbackResultDto> {
    // Req 2.5: Si Meta envía error → buscar sesión, eliminarla, lanzar BadRequestException
    if (query.error) {
      const sessionOnError = await this.oAuthSessionRepository.findByState(
        query.state,
      );
      if (sessionOnError) {
        await this.oAuthSessionRepository.delete(sessionOnError.id);
      }
      throw new BadRequestException(query.error);
    }

    // Req 2.1, 2.4: Buscar OAuthSession por state
    const session = await this.oAuthSessionRepository.findByState(query.state);
    if (!session) {
      throw new BadRequestException('session_not_found_or_expired');
    }

    // Req 2.6, 8.5: Verificar TTL
    if (session.isExpired()) {
      await this.oAuthSessionRepository.delete(session.id);
      throw new GoneException('oauth_session_expired');
    }

    // Req 2.2, 2.3, 8.3: Comparar state con timingSafeEqual (tiempo constante)
    const receivedBuf = Buffer.from(query.state);
    const storedBuf = Buffer.from(session.state);
    const stateMatch =
      receivedBuf.length === storedBuf.length &&
      crypto.timingSafeEqual(receivedBuf, storedBuf);

    if (!stateMatch) {
      await this.oAuthSessionRepository.delete(session.id);
      throw new BadRequestException('invalid_state');
    }

    // Req 3.1: Intercambiar code por Short-Lived Token
    const shortLivedToken =
      await this.metaGraphApiService.exchangeCodeForShortLivedToken(
        query.code!,
        session.pkceVerifier,
        envs.metaRedirectUri,
      );

    // Req 3.2: Intercambiar Short-Lived Token por Long-Lived Token
    const longLivedToken =
      await this.metaGraphApiService.exchangeForLongLivedToken(shortLivedToken);

    // Req 3.3, 8.6: Cifrar el Long-Lived Token antes de persistirlo — nunca en texto plano
    const encryptedToken = this.encryptionService.encrypt(longLivedToken);

    // Req 3.3: Actualizar OAuthSession con el token cifrado
    await this.oAuthSessionRepository.update(session.id, { encryptedToken });

    // Req 4.1: Descifrar el token para usarlo en las llamadas a Meta
    const plainToken = this.encryptionService.decrypt(encryptedToken);

    // Req 4.1: Obtener businesses del usuario
    const businesses = await this.metaGraphApiService.getBusinesses(plainToken);

    // Req 4.2: Obtener WABAs de cada business y acumularlas
    const allWabas = (
      await Promise.all(
        businesses.map((b) =>
          this.metaGraphApiService.getWabaAccounts(b.id, plainToken),
        ),
      )
    ).flat();

    // Req 4.9: Sin WABAs → HTTP 422
    if (allWabas.length === 0) {
      throw new UnprocessableEntityException('no_waba_found');
    }

    // Req 4.4: Múltiples WABAs → pedir selección al usuario
    if (allWabas.length > 1) {
      await this.oAuthSessionRepository.update(session.id, {
        status: OAuthSessionStatus.PENDING_WABA_SELECTION,
      });
      return { status: 'pending_waba_selection', wabas: allWabas };
    }

    // Req 4.3: Exactamente una WABA → auto-seleccionar
    const selectedWaba = allWabas[0];

    // Req 9.5: Validar que wabaId contiene solo dígitos
    if (!/^\d+$/.test(selectedWaba.id)) {
      throw new BadRequestException(
        `invalid_waba_id: ${selectedWaba.id} must contain only digits`,
      );
    }

    await this.oAuthSessionRepository.update(session.id, {
      wabaId: selectedWaba.id,
    });

    // Req 4.5: Obtener phone numbers de la WABA seleccionada
    const phones = await this.metaGraphApiService.getPhoneNumbers(
      selectedWaba.id,
      plainToken,
    );

    // Req 4.10: Sin phones → HTTP 422
    if (phones.length === 0) {
      throw new UnprocessableEntityException('no_phone_number_found');
    }

    // Req 4.7: Múltiples phones → pedir selección al usuario
    if (phones.length > 1) {
      await this.oAuthSessionRepository.update(session.id, {
        status: OAuthSessionStatus.PENDING_PHONE_SELECTION,
      });
      return { status: 'pending_phone_selection', phones };
    }

    // Req 4.6: Exactamente un phone → auto-seleccionar
    const selectedPhone = phones[0];

    // Req 9.5: Validar que phoneNumberId contiene solo dígitos
    if (!/^\d+$/.test(selectedPhone.id)) {
      throw new BadRequestException(
        `invalid_phone_number_id: ${selectedPhone.id} must contain only digits`,
      );
    }

    await this.oAuthSessionRepository.update(session.id, {
      phoneNumberId: selectedPhone.id,
    });

    // Req 5.1–5.5: Completar el flujo con transacción atómica
    const updatedSession = new OAuthSessionEntity({
      ...session,
      phoneNumberId: selectedPhone.id,
      wabaId: selectedWaba.id,
    });
    return this.completeFlow(updatedSession, selectedPhone.display_phone_number);
  }

  /**
   * Req 4.3, 4.4, 4.6, 4.7, 8.7: Selección manual de WABA cuando hay múltiples.
   */
  async selectWaba(userId: string, dto: SelectWabaDto): Promise<CallbackResultDto> {
    const session = await this.oAuthSessionRepository.findActiveByUserId(userId);
    if (!session) throw new NotFoundException('session_not_found');

    // Req 8.7: Verificar ownership
    if (!session.isOwnedBy(userId)) throw new ForbiddenException('forbidden');

    const plainToken = this.encryptionService.decrypt(session.encryptedToken!);

    // Req 4.5: Obtener phones de la WABA seleccionada
    const phones = await this.metaGraphApiService.getPhoneNumbers(dto.wabaId, plainToken);

    if (phones.length === 0) {
      throw new UnprocessableEntityException('no_phone_number_found');
    }

    await this.oAuthSessionRepository.update(session.id, { wabaId: dto.wabaId });

    if (phones.length > 1) {
      await this.oAuthSessionRepository.update(session.id, {
        status: OAuthSessionStatus.PENDING_PHONE_SELECTION,
      });
      return { status: 'pending_phone_selection', phones };
    }

    const selectedPhone = phones[0];
    if (!/^\d+$/.test(selectedPhone.id)) {
      throw new BadRequestException(`invalid_phone_number_id: ${selectedPhone.id}`);
    }

    await this.oAuthSessionRepository.update(session.id, { phoneNumberId: selectedPhone.id });

    const updatedSession = new OAuthSessionEntity({
      ...session,
      wabaId: dto.wabaId,
      phoneNumberId: selectedPhone.id,
    });
    return this.completeFlow(updatedSession, selectedPhone.display_phone_number);
  }

  /**
   * Req 4.6, 4.7, 8.7: Selección manual de phone number cuando hay múltiples.
   */
  async selectPhone(userId: string, dto: SelectPhoneDto): Promise<{ whatsappSessionId: string }> {
    const session = await this.oAuthSessionRepository.findActiveByUserId(userId);
    if (!session) throw new NotFoundException('session_not_found');

    // Req 8.7: Verificar ownership
    if (!session.isOwnedBy(userId)) throw new ForbiddenException('forbidden');

    await this.oAuthSessionRepository.update(session.id, { phoneNumberId: dto.phoneNumberId });

    const plainToken = this.encryptionService.decrypt(session.encryptedToken!);
    const phones = await this.metaGraphApiService.getPhoneNumbers(session.wabaId!, plainToken);
    const selectedPhone = phones.find((p) => p.id === dto.phoneNumberId);
    const displayNumber = selectedPhone?.display_phone_number ?? dto.phoneNumberId;

    const updatedSession = new OAuthSessionEntity({
      ...session,
      phoneNumberId: dto.phoneNumberId,
    });
    return this.completeFlow(updatedSession, displayNumber);
  }

  /**
   * Req 6.1–6.4: Retorna el estado actual del flujo OAuth del usuario.
   */
  async getStatus(userId: string): Promise<{ status: string; whatsappSessionId?: string }> {
    const session = await this.oAuthSessionRepository.findActiveByUserId(userId);
    if (!session) throw new NotFoundException('session_not_found');
    return { status: session.status };
  }

  /**
   * Req 7.1–7.3: Cancela la sesión OAuth activa del usuario.
   */
  async cancelSession(userId: string): Promise<void> {
    const session = await this.oAuthSessionRepository.findActiveByUserId(userId);
    if (!session) throw new NotFoundException('session_not_found');
    await this.oAuthSessionRepository.delete(session.id);
  }

  /**
   * Req 5.1–5.5: Crea WhatsappSession y elimina OAuthSession en una transacción atómica.
   */
  private async completeFlow(
    session: OAuthSessionEntity,
    phoneDisplayNumber: string,
  ): Promise<{ whatsappSessionId: string }> {
    // Req 5.3: Verificar si ya existe WhatsappSession activa con el mismo phoneNumberId
    const existing = await this.prisma.whatsappSession.findFirst({
      where: {
        userId: session.clientId,
        phoneNumberId: session.phoneNumberId,
        isActive: true,
      },
    });

    if (existing) {
      throw new ConflictException('session_already_exists');
    }

    // Req 5.5: Transacción atómica — crear WhatsappSession + eliminar OAuthSession
    try {
      const [createdSession] = await this.prisma.$transaction([
        this.prisma.whatsappSession.create({
          data: {
            userId: session.clientId,
            phoneNumber: phoneDisplayNumber,
            phoneNumberId: session.phoneNumberId,
            accessToken: session.encryptedToken,
            wabaId: session.wabaId,
            channelType: ChannelType.OFFICIAL,
            isReady: true,
            isActive: true,
          },
        }),
        this.prisma.oAuthSession.delete({ where: { id: session.id } }),
      ]);

      // Req 5.2: Retornar el identificador de la nueva WhatsappSession
      return { whatsappSessionId: createdSession.id };
    } catch {
      // Req 5.4: Si falla la BD → HTTP 500, mantener OAuthSession activa para reintento
      throw new InternalServerErrorException('internal_server_error');
    }
  }
}
