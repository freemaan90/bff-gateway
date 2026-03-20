/**
 * Feature: whatsapp-onboarding — Property-Based Tests
 * Properties: 5, 6, 7, 9, 10, 11, 12, 13, 17
 *
 * Validates: Requirements 2.3, 2.6, 3.3, 3.6, 4.3, 4.4, 4.6, 4.7, 5.1, 5.2, 5.3, 5.5, 8.5, 9.5
 */
import { BadRequestException, ConflictException, GoneException } from '@nestjs/common';
import * as fc from 'fast-check';
import { WhatsappOnboardingService } from './whatsapp-onboarding.service';
import { OAuthSessionRepository } from '../repositories/oauth-session.repository';
import { MetaGraphApiService } from './meta-graph-api.service';
import { EncryptionService } from '../../../common/encryption/encryption.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OAuthSessionEntity, OAuthSessionStatus } from '../domain/oauth-session.entity';

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

function makeActiveSession(state: string): OAuthSessionEntity {
  return new OAuthSessionEntity({
    id: 'session-id-prop',
    clientId: 'user-prop',
    state,
    pkceVerifier: 'pkce-verifier',
    status: OAuthSessionStatus.PENDING_AUTHORIZATION,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    createdAt: new Date(),
  });
}

/** Generador de IDs numéricos (solo dígitos) */
const arbNumericId = fc.array(
  fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
  { minLength: 1, maxLength: 15 },
).map((chars) => chars.join(''));

describe('WhatsappOnboardingService — Property-Based Tests', () => {
  let service: WhatsappOnboardingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WhatsappOnboardingService(mockRepo, mockMetaGraphApi, mockEncryptionService, mockPrisma);
  });

  /**
   * Propiedad 5: State inválido elimina la sesión
   *
   * Para cualquier callback con un state que no coincide con el almacenado,
   * la respuesta debe ser HTTP 400 con invalid_state y la OAuthSession debe
   * ser eliminada de la base de datos.
   *
   * Validates: Requirement 2.3
   */
  it('Property 5: state inválido siempre lanza BadRequestException(invalid_state) y elimina la sesión', async () => {
    // Feature: whatsapp-onboarding, Property 5: State inválido elimina la sesión
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }),
        fc.string({ minLength: 1, maxLength: 64 }),
        async (storedState, receivedState) => {
          fc.pre(storedState !== receivedState);

          jest.clearAllMocks();
          const session = makeActiveSession(storedState);
          mockRepo.findByState.mockResolvedValue(session);
          mockRepo.delete.mockResolvedValue(undefined);

          await expect(
            service.handleCallback({ state: receivedState, code: 'some-code' }),
          ).rejects.toThrow(BadRequestException);

          expect(mockRepo.delete).toHaveBeenCalledWith(session.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propiedad 6: Sesión expirada retorna HTTP 410
   *
   * Para cualquier OAuthSession cuyo expiresAt sea anterior al momento actual,
   * cualquier operación sobre ella debe retornar HTTP 410 con oauth_session_expired
   * y eliminar la sesión.
   *
   * Validates: Requirements 2.6, 8.5
   */
  it('Property 6: sesión expirada siempre lanza GoneException(oauth_session_expired) y elimina la sesión', async () => {
    // Feature: whatsapp-onboarding, Property 6: Sesión expirada retorna HTTP 410
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }),
        fc.integer({ min: 1, max: 24 * 60 * 60 * 1000 }),
        async (state, msExpiredAgo) => {
          jest.clearAllMocks();

          const expiredSession = new OAuthSessionEntity({
            id: 'expired-session-id',
            clientId: 'user-expired',
            state,
            pkceVerifier: 'pkce-verifier',
            status: OAuthSessionStatus.PENDING_AUTHORIZATION,
            expiresAt: new Date(Date.now() - msExpiredAgo),
            createdAt: new Date(Date.now() - msExpiredAgo - 1000),
          });

          mockRepo.findByState.mockResolvedValue(expiredSession);
          mockRepo.delete.mockResolvedValue(undefined);

          let thrownError: unknown;
          try {
            await service.handleCallback({ state, code: 'some-code' });
          } catch (e) {
            thrownError = e;
          }

          expect(thrownError).toBeInstanceOf(GoneException);
          expect((thrownError as GoneException).message).toBe('oauth_session_expired');
          expect(mockRepo.delete).toHaveBeenCalledWith(expiredSession.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propiedad 7: Token cifrado antes de persistir
   *
   * Para cualquier Long-Lived Token obtenido de Meta, el valor almacenado en
   * OAuthSession.encryptedToken no debe ser igual al token en texto plano.
   *
   * Validates: Requisito 3.3
   */
  it('Property 7: el token almacenado en la sesión es siempre el valor cifrado, nunca el texto plano', async () => {
    // Feature: whatsapp-onboarding, Property 7: Token cifrado antes de persistir
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 256 }),
        async (longLivedToken) => {
          jest.clearAllMocks();

          const state = 'fixed-state-for-prop7';
          const session = makeActiveSession(state);
          mockRepo.findByState.mockResolvedValue(session);
          mockRepo.delete.mockResolvedValue(undefined);
          mockRepo.update.mockResolvedValue(undefined as any);

          mockMetaGraphApi.exchangeCodeForShortLivedToken.mockResolvedValue('short-token');
          mockMetaGraphApi.exchangeForLongLivedToken.mockResolvedValue(longLivedToken);

          const encryptedValue = `encrypted:${longLivedToken}`;
          mockEncryptionService.encrypt.mockReturnValue(encryptedValue);
          mockEncryptionService.decrypt.mockReturnValue(longLivedToken);

          mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
          mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
            { id: '123456789', name: 'WABA', currency: 'USD', timezone_id: '1' },
          ]);
          mockMetaGraphApi.getPhoneNumbers.mockResolvedValue([
            { id: '987654321', display_phone_number: '+1234567890', verified_name: 'Phone' },
          ]);

          (mockPrisma.whatsappSession.findFirst as jest.Mock).mockResolvedValue(null);
          (mockPrisma.$transaction as jest.Mock).mockResolvedValue([{ id: 'ws-prop7-id' }, undefined]);

          await service.handleCallback({ state, code: 'code' });

          expect(mockEncryptionService.encrypt).toHaveBeenCalledWith(longLivedToken);
          expect(mockRepo.update).toHaveBeenCalledWith(session.id, {
            encryptedToken: encryptedValue,
          });

          const updateCall = mockRepo.update.mock.calls[0];
          expect(updateCall[1].encryptedToken).not.toBe(longLivedToken);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propiedad 9: Token nunca aparece en respuestas HTTP
   *
   * Para cualquier respuesta del handleCallback, el cuerpo no debe contener
   * el Long-Lived Token en texto plano.
   *
   * Validates: Requisitos 3.6, 6.3
   */
  it('Property 9: la respuesta HTTP nunca contiene el long-lived token en texto plano', async () => {
    // Feature: whatsapp-onboarding, Property 9: Token nunca aparece en respuestas HTTP
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 256 }),
        async (longLivedToken) => {
          jest.clearAllMocks();

          const state = 'fixed-state-for-prop9';
          const session = makeActiveSession(state);
          mockRepo.findByState.mockResolvedValue(session);
          mockRepo.update.mockResolvedValue(undefined as any);

          mockMetaGraphApi.exchangeCodeForShortLivedToken.mockResolvedValue('short-token');
          mockMetaGraphApi.exchangeForLongLivedToken.mockResolvedValue(longLivedToken);
          mockEncryptionService.encrypt.mockReturnValue('opaque-encrypted-value');
          mockEncryptionService.decrypt.mockReturnValue(longLivedToken);

          mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
          mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
            { id: '123456789', name: 'WABA', currency: 'USD', timezone_id: '1' },
          ]);
          mockMetaGraphApi.getPhoneNumbers.mockResolvedValue([
            { id: '987654321', display_phone_number: '+1234567890', verified_name: 'Phone' },
          ]);

          (mockPrisma.whatsappSession.findFirst as jest.Mock).mockResolvedValue(null);
          (mockPrisma.$transaction as jest.Mock).mockResolvedValue([{ id: 'ws-prop9-id' }, undefined]);

          const result = await service.handleCallback({ state, code: 'code' });

          const resultStr = JSON.stringify(result);
          expect(resultStr).not.toContain(longLivedToken);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propiedad 10: Auto-selección cuando hay exactamente uno
   *
   * Para cualquier respuesta de Meta con exactamente una WABA y exactamente un
   * phone number, el sistema debe seleccionarlos automáticamente.
   *
   * Validates: Requisitos 4.3, 4.6
   */
  it('Property 10: con exactamente una WABA y un phone, siempre retorna whatsappSessionId', async () => {
    // Feature: whatsapp-onboarding, Property 10: Auto-selección cuando hay exactamente uno
    await fc.assert(
      fc.asyncProperty(
        arbNumericId,
        arbNumericId,
        async (wabaId, phoneId) => {
          jest.clearAllMocks();

          const state = 'fixed-state-for-prop10';
          const session = makeActiveSession(state);
          mockRepo.findByState.mockResolvedValue(session);
          mockRepo.update.mockResolvedValue(undefined as any);

          mockMetaGraphApi.exchangeCodeForShortLivedToken.mockResolvedValue('short-token');
          mockMetaGraphApi.exchangeForLongLivedToken.mockResolvedValue('long-token');
          mockEncryptionService.encrypt.mockReturnValue('encrypted-token');
          mockEncryptionService.decrypt.mockReturnValue('long-token');

          mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
          mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
            { id: wabaId, name: 'WABA', currency: 'USD', timezone_id: '1' },
          ]);
          mockMetaGraphApi.getPhoneNumbers.mockResolvedValue([
            { id: phoneId, display_phone_number: '+1234567890', verified_name: 'Phone' },
          ]);

          (mockPrisma.whatsappSession.findFirst as jest.Mock).mockResolvedValue(null);
          (mockPrisma.$transaction as jest.Mock).mockResolvedValue([{ id: 'ws-prop10-id' }, undefined]);

          const result = await service.handleCallback({ state, code: 'code' });

          expect(result.whatsappSessionId).toBe('ws-prop10-id');
          expect(result.status).toBeUndefined();
          expect(result.wabas).toBeUndefined();
          expect(result.phones).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propiedad 11: Lista retornada cuando hay múltiples opciones (WABAs)
   *
   * Para cualquier respuesta de Meta con N > 1 WABAs, el sistema debe retornar
   * la lista completa de N elementos.
   *
   * Validates: Requisito 4.4
   */
  it('Property 11: con múltiples WABAs, siempre retorna pending_waba_selection con la lista completa', async () => {
    // Feature: whatsapp-onboarding, Property 11: Lista retornada cuando hay múltiples opciones
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: arbNumericId,
            name: fc.string({ minLength: 1, maxLength: 50 }),
            currency: fc.constantFrom('USD', 'EUR', 'GBP'),
            timezone_id: fc.string({ minLength: 1, maxLength: 3 }),
          }),
          { minLength: 2, maxLength: 10 },
        ),
        async (wabas) => {
          jest.clearAllMocks();

          const state = 'fixed-state-for-prop11-wabas';
          const session = makeActiveSession(state);
          mockRepo.findByState.mockResolvedValue(session);
          mockRepo.update.mockResolvedValue(undefined as any);

          mockMetaGraphApi.exchangeCodeForShortLivedToken.mockResolvedValue('short-token');
          mockMetaGraphApi.exchangeForLongLivedToken.mockResolvedValue('long-token');
          mockEncryptionService.encrypt.mockReturnValue('encrypted-token');
          mockEncryptionService.decrypt.mockReturnValue('long-token');

          mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
          mockMetaGraphApi.getWabaAccounts.mockResolvedValue(wabas);

          const result = await service.handleCallback({ state, code: 'code' });

          expect(result.status).toBe('pending_waba_selection');
          expect(result.wabas).toHaveLength(wabas.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propiedad 11: Lista retornada cuando hay múltiples opciones (phones)
   *
   * Para cualquier respuesta de Meta con N > 1 phones, el sistema debe retornar
   * la lista completa de N elementos.
   *
   * Validates: Requisito 4.7
   */
  it('Property 11: con múltiples phones, siempre retorna pending_phone_selection con la lista completa', async () => {
    // Feature: whatsapp-onboarding, Property 11: Lista retornada cuando hay múltiples opciones
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: arbNumericId,
            display_phone_number: fc.string({ minLength: 1, maxLength: 20 }),
            verified_name: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 2, maxLength: 10 },
        ),
        async (phones) => {
          jest.clearAllMocks();

          const state = 'fixed-state-for-prop11-phones';
          const session = makeActiveSession(state);
          mockRepo.findByState.mockResolvedValue(session);
          mockRepo.update.mockResolvedValue(undefined as any);

          mockMetaGraphApi.exchangeCodeForShortLivedToken.mockResolvedValue('short-token');
          mockMetaGraphApi.exchangeForLongLivedToken.mockResolvedValue('long-token');
          mockEncryptionService.encrypt.mockReturnValue('encrypted-token');
          mockEncryptionService.decrypt.mockReturnValue('long-token');

          mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
          mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
            { id: '123456789', name: 'WABA', currency: 'USD', timezone_id: '1' },
          ]);
          mockMetaGraphApi.getPhoneNumbers.mockResolvedValue(phones);

          const result = await service.handleCallback({ state, code: 'code' });

          expect(result.status).toBe('pending_phone_selection');
          expect(result.phones).toHaveLength(phones.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propiedad 12: Creación de WhatsappSession completa el flujo
   *
   * Para cualquier OAuthSession con wabaId, phoneNumberId y encryptedToken disponibles,
   * la operación de completar el flujo debe crear una WhatsappSession con channelType=OFFICIAL
   * y eliminar la OAuthSession en la misma transacción.
   *
   * Validates: Requisitos 5.1, 5.2, 5.5
   */
  it('Property 12: completeFlow siempre retorna whatsappSessionId y ejecuta la transacción atómica', async () => {
    // Feature: whatsapp-onboarding, Property 12: Creación de WhatsappSession completa el flujo
    await fc.assert(
      fc.asyncProperty(
        arbNumericId,
        arbNumericId,
        fc.uuid(),
        async (wabaId, phoneId, expectedSessionId) => {
          jest.clearAllMocks();

          const state = 'fixed-state-for-prop12';
          const session = makeActiveSession(state);
          mockRepo.findByState.mockResolvedValue(session);
          mockRepo.update.mockResolvedValue(undefined as any);

          mockMetaGraphApi.exchangeCodeForShortLivedToken.mockResolvedValue('short-token');
          mockMetaGraphApi.exchangeForLongLivedToken.mockResolvedValue('long-token');
          mockEncryptionService.encrypt.mockReturnValue('encrypted-token');
          mockEncryptionService.decrypt.mockReturnValue('long-token');

          mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
          mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
            { id: wabaId, name: 'WABA', currency: 'USD', timezone_id: '1' },
          ]);
          mockMetaGraphApi.getPhoneNumbers.mockResolvedValue([
            { id: phoneId, display_phone_number: '+1234567890', verified_name: 'Phone' },
          ]);

          (mockPrisma.whatsappSession.findFirst as jest.Mock).mockResolvedValue(null);
          (mockPrisma.$transaction as jest.Mock).mockResolvedValue([
            { id: expectedSessionId },
            undefined,
          ]);

          const result = await service.handleCallback({ state, code: 'code' });

          expect(result.whatsappSessionId).toBe(expectedSessionId);
          expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propiedad 13: Unicidad de phone_number_id por usuario
   *
   * Para cualquier intento de crear una WhatsappSession con un phoneNumberId que ya
   * existe activo para el mismo usuario, el sistema debe retornar HTTP 409 sin crear duplicado.
   *
   * Validates: Requisito 5.3
   */
  it('Property 13: si ya existe WhatsappSession activa con el mismo phoneNumberId, siempre lanza ConflictException', async () => {
    // Feature: whatsapp-onboarding, Property 13: Unicidad de phone_number_id por usuario
    await fc.assert(
      fc.asyncProperty(
        arbNumericId,
        arbNumericId,
        async (wabaId, phoneId) => {
          jest.clearAllMocks();

          const state = 'fixed-state-for-prop13';
          const session = makeActiveSession(state);
          mockRepo.findByState.mockResolvedValue(session);
          mockRepo.update.mockResolvedValue(undefined as any);

          mockMetaGraphApi.exchangeCodeForShortLivedToken.mockResolvedValue('short-token');
          mockMetaGraphApi.exchangeForLongLivedToken.mockResolvedValue('long-token');
          mockEncryptionService.encrypt.mockReturnValue('encrypted-token');
          mockEncryptionService.decrypt.mockReturnValue('long-token');

          mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
          mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
            { id: wabaId, name: 'WABA', currency: 'USD', timezone_id: '1' },
          ]);
          mockMetaGraphApi.getPhoneNumbers.mockResolvedValue([
            { id: phoneId, display_phone_number: '+1234567890', verified_name: 'Phone' },
          ]);

          // Simular que ya existe una sesión activa con ese phoneNumberId
          (mockPrisma.whatsappSession.findFirst as jest.Mock).mockResolvedValue({
            id: 'existing-ws-id',
            phoneNumberId: phoneId,
          });

          await expect(
            service.handleCallback({ state, code: 'code' }),
          ).rejects.toThrow(ConflictException);

          expect(mockPrisma.$transaction).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propiedad 17: Validación numérica de waba_id
   *
   * Para cualquier string que contenga caracteres no numéricos como wabaId,
   * el sistema debe rechazarlo con BadRequestException.
   *
   * Validates: Requisito 9.5
   */
  it('Property 17: wabaId con caracteres no numéricos siempre lanza BadRequestException', async () => {
    // Feature: whatsapp-onboarding, Property 17: Validación numérica de waba_id y phone_number_id
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /\D/.test(s)),
        async (nonNumericWabaId) => {
          jest.clearAllMocks();

          const state = 'fixed-state-for-prop17-waba';
          const session = makeActiveSession(state);
          mockRepo.findByState.mockResolvedValue(session);
          mockRepo.update.mockResolvedValue(undefined as any);

          mockMetaGraphApi.exchangeCodeForShortLivedToken.mockResolvedValue('short-token');
          mockMetaGraphApi.exchangeForLongLivedToken.mockResolvedValue('long-token');
          mockEncryptionService.encrypt.mockReturnValue('encrypted-token');
          mockEncryptionService.decrypt.mockReturnValue('long-token');

          mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
          mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
            { id: nonNumericWabaId, name: 'WABA', currency: 'USD', timezone_id: '1' },
          ]);

          await expect(
            service.handleCallback({ state, code: 'code' }),
          ).rejects.toThrow(BadRequestException);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propiedad 17: Validación numérica de phone_number_id
   *
   * Para cualquier string que contenga caracteres no numéricos como phoneNumberId,
   * el sistema debe rechazarlo con BadRequestException.
   *
   * Validates: Requisito 9.5
   */
  it('Property 17: phoneNumberId con caracteres no numéricos siempre lanza BadRequestException', async () => {
    // Feature: whatsapp-onboarding, Property 17: Validación numérica de waba_id y phone_number_id
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /\D/.test(s)),
        async (nonNumericPhoneId) => {
          jest.clearAllMocks();

          const state = 'fixed-state-for-prop17-phone';
          const session = makeActiveSession(state);
          mockRepo.findByState.mockResolvedValue(session);
          mockRepo.update.mockResolvedValue(undefined as any);

          mockMetaGraphApi.exchangeCodeForShortLivedToken.mockResolvedValue('short-token');
          mockMetaGraphApi.exchangeForLongLivedToken.mockResolvedValue('long-token');
          mockEncryptionService.encrypt.mockReturnValue('encrypted-token');
          mockEncryptionService.decrypt.mockReturnValue('long-token');

          mockMetaGraphApi.getBusinesses.mockResolvedValue([{ id: 'biz-1', name: 'Biz' }]);
          mockMetaGraphApi.getWabaAccounts.mockResolvedValue([
            { id: '123456789', name: 'WABA', currency: 'USD', timezone_id: '1' },
          ]);
          mockMetaGraphApi.getPhoneNumbers.mockResolvedValue([
            { id: nonNumericPhoneId, display_phone_number: '+1234567890', verified_name: 'Phone' },
          ]);

          await expect(
            service.handleCallback({ state, code: 'code' }),
          ).rejects.toThrow(BadRequestException);
        },
      ),
      { numRuns: 100 },
    );
  });
});
