/**
 * Tests unitarios para WhatsappOnboardingService — handleCallback
 * Validates: Requirements 2.2, 2.4, 2.5, 3.1, 3.2, 3.3, 4.1–4.10, 5.1–5.5, 9.5
 */
import {
  BadRequestException,
  ConflictException,
  GoneException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { WhatsappOnboardingService } from './whatsapp-onboarding.service';
import { OAuthSessionRepository } from '../repositories/oauth-session.repository';
import { MetaGraphApiService } from './meta-graph-api.service';
import { EncryptionService } from '../../../common/encryption/encryption.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OAuthSessionEntity } from '../domain/oauth-session.entity';
import { OAuthSessionStatus } from '../domain/oauth-session.entity';

jest.mock('../../../config/envs', () => ({
  envs: {
    metaAppId: 'test-app-id',
    metaAppSecret: 'test-app-secret',
    metaRedirectUri: 'https://example.com/callback',
  },
}));

const mockRepo: jest.Mocked<OAuthSessionRepository> = {
  create: jest.fn(),
  findByState: jest.fn(),
  findActiveByUserId: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  deleteByUserId: jest.fn(),
} as any;

const mockMetaGraphApi: jest.Mocked<MetaGraphApiService> = {
  exchangeCodeForShortLivedToken: jest.fn(),
  exchangeForLongLivedToken: jest.fn(),
  getBusinesses: jest.fn(),
  getWabaAccounts: jest.fn(),
  getPhoneNumbers: jest.fn(),
} as any;

const mockEncryptionService: jest.Mocked<EncryptionService> = {
  encrypt: jest.fn(),
  decrypt: jest.fn(),
} as any;

const mockPrisma = {
  whatsappSession: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  oAuthSession: {
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
} as unknown as jest.Mocked<PrismaService>;

function makeSession(overrides: Partial<OAuthSessionEntity> = {}): OAuthSessionEntity {
  const state = 'valid-state-value-for-testing-purposes-here';
  const session = new OAuthSessionEntity({
    id: 'session-id-1',
    clientId: 'user-1',
    state,
    pkceVerifier: 'pkce-verifier-value',
    status: OAuthSessionStatus.PENDING_AUTHORIZATION,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min en el futuro
    createdAt: new Date(),
    ...overrides,
  });
  return session;
}

describe('WhatsappOnboardingService — handleCallback', () => {
  let service: WhatsappOnboardingService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Defaults para el happy path del intercambio de tokens
    mockMetaGraphApi.exchangeCodeForShortLivedToken.mockResolvedValue('short-lived-token');
    mockMetaGraphApi.exchangeForLongLivedToken.mockResolvedValue('long-lived-token');
    mockEncryptionService.encrypt.mockReturnValue('encrypted-token');
    mockEncryptionService.decrypt.mockReturnValue('long-lived-token');
    mockRepo.update.mockResolvedValue(undefined as any);
    // Defaults para el happy path de WABAs y phones (una WABA, un phone)
    mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Business 1' }]);
    mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
      { id: '123456789', name: 'WABA 1', currency: 'USD', timezone_id: '1' },
    ]);
    mockMetaGraphApi.getPhoneNumbers.mockResolvedValue([
      { id: '987654321', display_phone_number: '+1234567890', verified_name: 'Test' },
    ]);
    // Defaults para completeFlow (sin sesión duplicada, transacción exitosa)
    (mockPrisma.whatsappSession.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([
      { id: 'new-whatsapp-session-id' },
      undefined,
    ]);
    service = new WhatsappOnboardingService(mockRepo, mockMetaGraphApi, mockEncryptionService, mockPrisma);
  });

  describe('Req 2.5: error de Meta en callback', () => {
    it('lanza BadRequestException con el mensaje de error de Meta', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      mockRepo.delete.mockResolvedValue(undefined);

      await expect(
        service.handleCallback({ state: session.state, error: 'access_denied' }),
      ).rejects.toThrow(new BadRequestException('access_denied'));

      expect(mockRepo.delete).toHaveBeenCalledWith(session.id);
    });

    it('no falla si no existe sesión cuando Meta envía error', async () => {
      mockRepo.findByState.mockResolvedValue(null);

      await expect(
        service.handleCallback({ state: 'unknown-state', error: 'access_denied' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('Req 2.4: sesión no encontrada', () => {
    it('lanza BadRequestException con session_not_found_or_expired', async () => {
      mockRepo.findByState.mockResolvedValue(null);

      await expect(
        service.handleCallback({ state: 'nonexistent-state', code: 'some-code' }),
      ).rejects.toThrow(new BadRequestException('session_not_found_or_expired'));
    });
  });

  describe('Req 2.6, 8.5: sesión expirada', () => {
    it('lanza GoneException y elimina la sesión', async () => {
      const expiredSession = makeSession({
        expiresAt: new Date(Date.now() - 1000), // expirada hace 1 segundo
      });
      mockRepo.findByState.mockResolvedValue(expiredSession);
      mockRepo.delete.mockResolvedValue(undefined);

      await expect(
        service.handleCallback({ state: expiredSession.state, code: 'code' }),
      ).rejects.toThrow(new GoneException('oauth_session_expired'));

      expect(mockRepo.delete).toHaveBeenCalledWith(expiredSession.id);
    });
  });

  describe('Req 2.2, 8.3: comparación en tiempo constante del state', () => {
    it('acepta el callback cuando el state recibido coincide exactamente con el almacenado', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);

      const result = await service.handleCallback({
        state: session.state,
        code: 'code',
      });

      expect(result.whatsappSessionId).toBe('new-whatsapp-session-id');
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('rechaza el callback cuando el state recibido difiere del almacenado (un carácter diferente)', async () => {
      const storedState = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const session = makeSession({ state: storedState });
      mockRepo.findByState.mockResolvedValue(session);
      mockRepo.delete.mockResolvedValue(undefined);

      // State con un carácter diferente al final
      const differentState = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';

      await expect(
        service.handleCallback({ state: differentState, code: 'code' }),
      ).rejects.toThrow(new BadRequestException('invalid_state'));

      expect(mockRepo.delete).toHaveBeenCalledWith(session.id);
    });
  });

  describe('Req 2.3: state inválido', () => {
    it('lanza BadRequestException con invalid_state y elimina la sesión', async () => {
      const session = makeSession({ state: 'stored-state-value' });
      mockRepo.findByState.mockResolvedValue(session);
      mockRepo.delete.mockResolvedValue(undefined);

      // Enviamos un state diferente al almacenado
      await expect(
        service.handleCallback({ state: 'different-state-val', code: 'code' }),
      ).rejects.toThrow(new BadRequestException('invalid_state'));

      expect(mockRepo.delete).toHaveBeenCalledWith(session.id);
    });
  });

  describe('callback válido — completeFlow', () => {
    it('retorna whatsappSessionId cuando hay una WABA y un phone (Req 5.1, 5.2)', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);

      const result = await service.handleCallback({
        state: session.state,
        code: 'valid-code',
      });

      expect(result).toEqual({ whatsappSessionId: 'new-whatsapp-session-id' });
    });

    it('ejecuta la transacción atómica con create y delete (Req 5.5)', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);

      await service.handleCallback({ state: session.state, code: 'code' });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Req 3.1, 3.2, 3.3: intercambio de tokens y cifrado', () => {
    it('llama a exchangeCodeForShortLivedToken con el code, pkceVerifier y redirectUri correctos', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);

      await service.handleCallback({ state: session.state, code: 'auth-code-123' });

      expect(mockMetaGraphApi.exchangeCodeForShortLivedToken).toHaveBeenCalledWith(
        'auth-code-123',
        session.pkceVerifier,
        'https://example.com/callback',
      );
    });

    it('llama a exchangeForLongLivedToken con el short-lived token obtenido', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      mockMetaGraphApi.exchangeCodeForShortLivedToken.mockResolvedValue('my-short-token');

      await service.handleCallback({ state: session.state, code: 'code' });

      expect(mockMetaGraphApi.exchangeForLongLivedToken).toHaveBeenCalledWith('my-short-token');
    });

    it('cifra el long-lived token antes de persistirlo (Req 3.3, 8.6)', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      mockMetaGraphApi.exchangeForLongLivedToken.mockResolvedValue('my-long-token');
      mockEncryptionService.encrypt.mockReturnValue('encrypted-long-token');

      await service.handleCallback({ state: session.state, code: 'code' });

      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('my-long-token');
      expect(mockRepo.update).toHaveBeenCalledWith(session.id, {
        encryptedToken: 'encrypted-long-token',
      });
    });

    it('la respuesta no contiene el token en texto plano (Req 3.6)', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      mockMetaGraphApi.exchangeForLongLivedToken.mockResolvedValue('super-secret-long-token');
      mockEncryptionService.encrypt.mockReturnValue('encrypted-value');
      mockEncryptionService.decrypt.mockReturnValue('super-secret-long-token');

      const result = await service.handleCallback({ state: session.state, code: 'code' });

      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('super-secret-long-token');
    });
  });
});

describe('WhatsappOnboardingService — WABAs y phones (Req 4.x, 9.5)', () => {
  let service: WhatsappOnboardingService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMetaGraphApi.exchangeCodeForShortLivedToken.mockResolvedValue('short-token');
    mockMetaGraphApi.exchangeForLongLivedToken.mockResolvedValue('long-token');
    mockEncryptionService.encrypt.mockReturnValue('encrypted-token');
    mockEncryptionService.decrypt.mockReturnValue('long-token');
    mockRepo.update.mockResolvedValue(undefined as any);
    (mockPrisma.whatsappSession.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([
      { id: 'new-ws-id' },
      undefined,
    ]);
    service = new WhatsappOnboardingService(mockRepo, mockMetaGraphApi, mockEncryptionService, mockPrisma);
  });

  function makeSession(overrides: Partial<OAuthSessionEntity> = {}): OAuthSessionEntity {
    const state = 'valid-state-value-for-testing-purposes-here';
    return new OAuthSessionEntity({
      id: 'session-id-waba',
      clientId: 'user-waba',
      state,
      pkceVerifier: 'pkce-verifier-value',
      status: OAuthSessionStatus.PENDING_AUTHORIZATION,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: new Date(),
      ...overrides,
    });
  }

  describe('Req 4.9: sin WABAs disponibles', () => {
    it('lanza UnprocessableEntityException con no_waba_found', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
      mockMetaGraphApi.getWabaAccounts.mockResolvedValue([]);

      await expect(
        service.handleCallback({ state: session.state, code: 'code' }),
      ).rejects.toThrow(new UnprocessableEntityException('no_waba_found'));
    });
  });

  describe('Req 4.10: sin phones disponibles', () => {
    it('lanza UnprocessableEntityException con no_phone_number_found', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
      mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
        { id: '111222333', name: 'WABA', currency: 'USD', timezone_id: '1' },
      ]);
      mockMetaGraphApi.getPhoneNumbers.mockResolvedValue([]);

      await expect(
        service.handleCallback({ state: session.state, code: 'code' }),
      ).rejects.toThrow(new UnprocessableEntityException('no_phone_number_found'));
    });
  });

  describe('Req 4.4: múltiples WABAs', () => {
    it('retorna pending_waba_selection con la lista de WABAs', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      const wabas = [
        { id: '111111111', name: 'WABA A', currency: 'USD', timezone_id: '1' },
        { id: '222222222', name: 'WABA B', currency: 'EUR', timezone_id: '2' },
      ];
      mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
      mockMetaGraphApi.getWabaAccounts.mockResolvedValue(wabas);

      const result = await service.handleCallback({ state: session.state, code: 'code' });

      expect(result.status).toBe('pending_waba_selection');
      expect(result.wabas).toEqual(wabas);
      expect(mockRepo.update).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({ status: OAuthSessionStatus.PENDING_WABA_SELECTION }),
      );
    });
  });

  describe('Req 4.7: múltiples phones', () => {
    it('retorna pending_phone_selection con la lista de phones', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      const phones = [
        { id: '111111111', display_phone_number: '+1111111111', verified_name: 'Phone A' },
        { id: '222222222', display_phone_number: '+2222222222', verified_name: 'Phone B' },
      ];
      mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
      mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
        { id: '333333333', name: 'WABA', currency: 'USD', timezone_id: '1' },
      ]);
      mockMetaGraphApi.getPhoneNumbers.mockResolvedValue(phones);

      const result = await service.handleCallback({ state: session.state, code: 'code' });

      expect(result.status).toBe('pending_phone_selection');
      expect(result.phones).toEqual(phones);
      expect(mockRepo.update).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({ status: OAuthSessionStatus.PENDING_PHONE_SELECTION }),
      );
    });
  });

  describe('Req 4.3, 4.6: auto-selección con una WABA y un phone', () => {
    it('persiste wabaId y phoneNumberId y retorna whatsappSessionId (Req 5.1, 5.2)', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
      mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
        { id: '444444444', name: 'WABA', currency: 'USD', timezone_id: '1' },
      ]);
      mockMetaGraphApi.getPhoneNumbers.mockResolvedValue([
        { id: '555555555', display_phone_number: '+5555555555', verified_name: 'Phone' },
      ]);

      const result = await service.handleCallback({ state: session.state, code: 'code' });

      expect(result.whatsappSessionId).toBe('new-ws-id');
      expect(mockRepo.update).toHaveBeenCalledWith(session.id, { wabaId: '444444444' });
      expect(mockRepo.update).toHaveBeenCalledWith(session.id, { phoneNumberId: '555555555' });
    });
  });

  describe('Req 9.5: validación numérica de wabaId', () => {
    it('lanza BadRequestException si wabaId contiene caracteres no numéricos', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
      mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
        { id: 'abc-not-numeric', name: 'WABA', currency: 'USD', timezone_id: '1' },
      ]);

      await expect(
        service.handleCallback({ state: session.state, code: 'code' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Req 9.5: validación numérica de phoneNumberId', () => {
    it('lanza BadRequestException si phoneNumberId contiene caracteres no numéricos', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
      mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
        { id: '123456789', name: 'WABA', currency: 'USD', timezone_id: '1' },
      ]);
      mockMetaGraphApi.getPhoneNumbers.mockResolvedValue([
        { id: 'phone-not-numeric', display_phone_number: '+1234567890', verified_name: 'Phone' },
      ]);

      await expect(
        service.handleCallback({ state: session.state, code: 'code' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Req 4.1: descifra el token para llamar a Meta', () => {
    it('llama a decrypt con el token cifrado y usa el resultado para getBusinesses', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      mockEncryptionService.encrypt.mockReturnValue('encrypted-token-xyz');
      mockEncryptionService.decrypt.mockReturnValue('plain-token-xyz');
      mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
      mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
        { id: '111111111', name: 'WABA', currency: 'USD', timezone_id: '1' },
      ]);
      mockMetaGraphApi.getPhoneNumbers.mockResolvedValue([
        { id: '222222222', display_phone_number: '+1234567890', verified_name: 'Phone' },
      ]);

      await service.handleCallback({ state: session.state, code: 'code' });

      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith('encrypted-token-xyz');
      expect(mockMetaGraphApi.getBusinesses).toHaveBeenCalledWith('plain-token-xyz');
    });
  });

  describe('Req 4.2: acumula WABAs de múltiples businesses', () => {
    it('llama a getWabaAccounts para cada business y acumula los resultados', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      mockMetaGraphApi.getBusinesses.mockResolvedValue([
        { id: 'biz-1', name: 'Business 1' },
        { id: 'biz-2', name: 'Business 2' },
      ]);
      // Cada business tiene una WABA → total 2 WABAs → pending_waba_selection
      mockMetaGraphApi.getWabaAccounts
        .mockResolvedValueOnce([{ id: '111111111', name: 'WABA 1', currency: 'USD', timezone_id: '1' }])
        .mockResolvedValueOnce([{ id: '222222222', name: 'WABA 2', currency: 'EUR', timezone_id: '2' }]);

      const result = await service.handleCallback({ state: session.state, code: 'code' });

      expect(mockMetaGraphApi.getWabaAccounts).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('pending_waba_selection');
      expect(result.wabas).toHaveLength(2);
    });
  });
});

describe('WhatsappOnboardingService — completeFlow (Req 5.x)', () => {
  let service: WhatsappOnboardingService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMetaGraphApi.exchangeCodeForShortLivedToken.mockResolvedValue('short-token');
    mockMetaGraphApi.exchangeForLongLivedToken.mockResolvedValue('long-token');
    mockEncryptionService.encrypt.mockReturnValue('encrypted-token');
    mockEncryptionService.decrypt.mockReturnValue('long-token');
    mockRepo.update.mockResolvedValue(undefined as any);
    mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
    mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
      { id: '123456789', name: 'WABA', currency: 'USD', timezone_id: '1' },
    ]);
    mockMetaGraphApi.getPhoneNumbers.mockResolvedValue([
      { id: '987654321', display_phone_number: '+1234567890', verified_name: 'Phone' },
    ]);
    service = new WhatsappOnboardingService(mockRepo, mockMetaGraphApi, mockEncryptionService, mockPrisma);
  });

  function makeSession(overrides: Partial<OAuthSessionEntity> = {}): OAuthSessionEntity {
    const state = 'valid-state-for-complete-flow';
    return new OAuthSessionEntity({
      id: 'session-cf-1',
      clientId: 'user-cf',
      state,
      pkceVerifier: 'pkce-verifier',
      status: OAuthSessionStatus.PENDING_AUTHORIZATION,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: new Date(),
      ...overrides,
    });
  }

  describe('Req 5.3: sesión duplicada', () => {
    it('lanza ConflictException(session_already_exists) si ya existe WhatsappSession activa con el mismo phoneNumberId', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      (mockPrisma.whatsappSession.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-ws' });

      await expect(
        service.handleCallback({ state: session.state, code: 'code' }),
      ).rejects.toThrow(new ConflictException('session_already_exists'));

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Req 5.4: error de BD en transacción', () => {
    it('lanza InternalServerErrorException y NO elimina la OAuthSession', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      (mockPrisma.whatsappSession.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.$transaction as jest.Mock).mockRejectedValue(new Error('DB connection error'));

      await expect(
        service.handleCallback({ state: session.state, code: 'code' }),
      ).rejects.toThrow(new InternalServerErrorException('internal_server_error'));

      // La OAuthSession NO debe ser eliminada directamente (solo dentro de la transacción)
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('Req 5.5: transacción atómica', () => {
    it('llama a $transaction con create de WhatsappSession y delete de OAuthSession', async () => {
      const session = makeSession();
      mockRepo.findByState.mockResolvedValue(session);
      (mockPrisma.whatsappSession.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.$transaction as jest.Mock).mockResolvedValue([{ id: 'ws-atomic-id' }, undefined]);

      const result = await service.handleCallback({ state: session.state, code: 'code' });

      expect(result.whatsappSessionId).toBe('ws-atomic-id');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
