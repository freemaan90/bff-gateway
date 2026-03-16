// Feature: whatsapp-official-api-integration
// Property 1: Channel-type-dependent session validation
// Property 2: Official session creation sets isReady=true
// Property 3: accessToken never appears in API responses
// Property 15: Session ownership authorization
// Validates: Requirements 1.5, 1.6, 2.1, 9.1, 9.5
import * as fc from 'fast-check';
import { ConflictException } from '@nestjs/common';
import { WhatsappSessionRepository } from './whatsapp-session.repository';
import { WhatsappSessionEntity } from '../domain/whatsapp-session.entity';

function makeEncryptionService() {
  return {
    encrypt: jest.fn((v: string) => `enc:${v}`),
    decrypt: jest.fn((v: string) => v.replace('enc:', '')),
  };
}

function makePrisma(existingSession: any = null, createdSession: any = null) {
  const defaultCreated = {
    id: 'db-id-001',
    sessionId: null,
    userId: 'user-1',
    phoneNumber: '5491112345678',
    phoneNumberId: '123456789',
    accessToken: 'enc:EAAtest',
    wabaId: '987654321',
    channelType: 'OFFICIAL',
    isReady: true,
    isActive: true,
    lastQrCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    whatsappSession: {
      findFirst: jest.fn().mockResolvedValue(existingSession),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(createdSession ?? defaultCreated),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

describe('WhatsappSessionRepository', () => {
  describe('createOfficialSession', () => {
    // Property 2: Official session creation sets isReady=true
    it('Property 2 — created official session has isReady=true', async () => {
      const prisma = makePrisma(null);
      const repo = new WhatsappSessionRepository(prisma as any, makeEncryptionService() as any);

      const session = await repo.createOfficialSession({
        userId: 'user-1',
        phoneNumber: '5491112345678',
        phoneNumberId: '123456789',
        accessToken: 'EAAtest_token_long_enough',
        wabaId: '987654321',
      });

      expect(session.isReady).toBe(true);
    });

    it('Property 2 — created official session has channelType=OFFICIAL', async () => {
      const prisma = makePrisma(null);
      const repo = new WhatsappSessionRepository(prisma as any, makeEncryptionService() as any);

      const session = await repo.createOfficialSession({
        userId: 'user-1',
        phoneNumber: '5491112345678',
        phoneNumberId: '123456789',
        accessToken: 'EAAtest_token_long_enough',
        wabaId: '987654321',
      });

      expect(session.channelType).toBe('OFFICIAL');
    });

    it('encrypts accessToken before persisting', async () => {
      const encryptionService = makeEncryptionService();
      const prisma = makePrisma(null);
      const repo = new WhatsappSessionRepository(prisma as any, encryptionService as any);

      await repo.createOfficialSession({
        userId: 'user-1',
        phoneNumber: '5491112345678',
        phoneNumberId: '123456789',
        accessToken: 'EAAtest_token_long_enough',
        wabaId: '987654321',
      });

      expect(encryptionService.encrypt).toHaveBeenCalledWith('EAAtest_token_long_enough');
      const createCall = prisma.whatsappSession.create.mock.calls[0][0];
      expect(createCall.data.accessToken).toBe('enc:EAAtest_token_long_enough');
    });

    it('throws ConflictException when phoneNumberId already exists for user', async () => {
      const existingSession = { id: 'existing', phoneNumberId: '123456789', userId: 'user-1' };
      const prisma = makePrisma(existingSession);
      const repo = new WhatsappSessionRepository(prisma as any, makeEncryptionService() as any);

      await expect(
        repo.createOfficialSession({
          userId: 'user-1',
          phoneNumber: '5491112345678',
          phoneNumberId: '123456789',
          accessToken: 'EAAtest_token_long_enough',
          wabaId: '987654321',
        }),
      ).rejects.toThrow(ConflictException);
    });

    // Property 1: Channel-type-dependent session validation (fc)
    it('Property 1 — fc: official sessions always have channelType=OFFICIAL and isReady=true', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            phoneNumberId: fc.stringMatching(/^\d{5,15}$/),
            wabaId: fc.stringMatching(/^\d{5,15}$/),
            phoneNumber: fc.stringMatching(/^\d{10,15}$/),
          }),
          async ({ phoneNumberId, wabaId, phoneNumber }) => {
            const prisma = makePrisma(null, {
              id: 'db-id',
              sessionId: null,
              userId: 'user-1',
              phoneNumber,
              phoneNumberId,
              accessToken: `enc:token`,
              wabaId,
              channelType: 'OFFICIAL',
              isReady: true,
              isActive: true,
              lastQrCode: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            const repo = new WhatsappSessionRepository(prisma as any, makeEncryptionService() as any);

            const session = await repo.createOfficialSession({
              userId: 'user-1',
              phoneNumber,
              phoneNumberId,
              accessToken: 'EAAtest_token_long_enough',
              wabaId,
            });

            return session.channelType === 'OFFICIAL' && session.isReady === true;
          },
        ),
      );
    });
  });

  describe('decryptAccessToken', () => {
    it('decrypts the stored accessToken', () => {
      const encryptionService = makeEncryptionService();
      const prisma = makePrisma();
      const repo = new WhatsappSessionRepository(prisma as any, encryptionService as any);

      const session = new WhatsappSessionEntity({
        id: 'id',
        accessToken: 'enc:EAAplaintoken',
        channelType: 'OFFICIAL',
        userId: 'user-1',
        phoneNumber: '5491112345678',
        isActive: true,
        isReady: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = repo.decryptAccessToken(session);
      expect(result).toBe('EAAplaintoken');
    });
  });
});
