jest.mock('../../../config/envs', () => ({
  envs: {
    metaAppId: 'test-app-id',
    metaAppSecret: 'test-secret',
    metaRedirectUri: 'http://localhost/callback',
    encryptionKey: '0'.repeat(64),
    META_APP_ID: 'test-app-id',
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { OAuthSessionStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OAuthSessionRepository } from './oauth-session.repository';
import { OAuthSessionEntity } from '../domain/oauth-session.entity';

const mockRow = {
  id: 'uuid-1',
  clientId: 'user-1',
  state: 'state-abc',
  pkceVerifier: 'verifier-xyz',
  encryptedToken: null,
  wabaId: null,
  phoneNumberId: null,
  status: OAuthSessionStatus.PENDING_AUTHORIZATION,
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  createdAt: new Date(),
};

const mockPrisma = {
  oAuthSession: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe('OAuthSessionRepository', () => {
  let repo: OAuthSessionRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthSessionRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repo = module.get<OAuthSessionRepository>(OAuthSessionRepository);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call prisma.oAuthSession.create with the provided data', async () => {
      mockPrisma.oAuthSession.create.mockResolvedValue(mockRow);

      const data = {
        clientId: 'user-1',
        state: 'state-abc',
        pkceVerifier: 'verifier-xyz',
        expiresAt: mockRow.expiresAt,
      };

      const result = await repo.create(data);

      expect(mockPrisma.oAuthSession.create).toHaveBeenCalledWith({ data });
      expect(result).toBeInstanceOf(OAuthSessionEntity);
      expect(result.clientId).toBe('user-1');
    });
  });

  describe('findByState', () => {
    it('should return entity when found', async () => {
      mockPrisma.oAuthSession.findUnique.mockResolvedValue(mockRow);

      const result = await repo.findByState('state-abc');

      expect(mockPrisma.oAuthSession.findUnique).toHaveBeenCalledWith({
        where: { state: 'state-abc' },
      });
      expect(result).toBeInstanceOf(OAuthSessionEntity);
      expect(result!.state).toBe('state-abc');
    });

    it('should return null when not found', async () => {
      mockPrisma.oAuthSession.findUnique.mockResolvedValue(null);

      const result = await repo.findByState('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findActiveByUserId', () => {
    it('should filter by status NOT IN [COMPLETED, FAILED] and expiresAt > now', async () => {
      mockPrisma.oAuthSession.findFirst.mockResolvedValue(mockRow);

      await repo.findActiveByUserId('user-1');

      const call = mockPrisma.oAuthSession.findFirst.mock.calls[0][0];
      expect(call.where.clientId).toBe('user-1');
      expect(call.where.status.notIn).toContain(OAuthSessionStatus.COMPLETED);
      expect(call.where.status.notIn).toContain(OAuthSessionStatus.FAILED);
      expect(call.where.expiresAt).toHaveProperty('gt');
    });

    it('should return entity when active session exists', async () => {
      mockPrisma.oAuthSession.findFirst.mockResolvedValue(mockRow);

      const result = await repo.findActiveByUserId('user-1');

      expect(result).toBeInstanceOf(OAuthSessionEntity);
    });

    it('should return null when no active session exists', async () => {
      mockPrisma.oAuthSession.findFirst.mockResolvedValue(null);

      const result = await repo.findActiveByUserId('user-1');

      expect(result).toBeNull();
    });

    it('should not return COMPLETED sessions', async () => {
      mockPrisma.oAuthSession.findFirst.mockResolvedValue(null);

      await repo.findActiveByUserId('user-1');

      const call = mockPrisma.oAuthSession.findFirst.mock.calls[0][0];
      expect(call.where.status.notIn).toContain(OAuthSessionStatus.COMPLETED);
    });

    it('should not return FAILED sessions', async () => {
      mockPrisma.oAuthSession.findFirst.mockResolvedValue(null);

      await repo.findActiveByUserId('user-1');

      const call = mockPrisma.oAuthSession.findFirst.mock.calls[0][0];
      expect(call.where.status.notIn).toContain(OAuthSessionStatus.FAILED);
    });
  });

  describe('update', () => {
    it('should call prisma.oAuthSession.update with id and data', async () => {
      const updatedRow = { ...mockRow, wabaId: 'waba-123' };
      mockPrisma.oAuthSession.update.mockResolvedValue(updatedRow);

      const result = await repo.update('uuid-1', { wabaId: 'waba-123' });

      expect(mockPrisma.oAuthSession.update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: { wabaId: 'waba-123' },
      });
      expect(result).toBeInstanceOf(OAuthSessionEntity);
      expect(result.wabaId).toBe('waba-123');
    });
  });

  describe('delete', () => {
    it('should call prisma.oAuthSession.delete with the given id', async () => {
      mockPrisma.oAuthSession.delete.mockResolvedValue(mockRow);

      await repo.delete('uuid-1');

      expect(mockPrisma.oAuthSession.delete).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
      });
    });
  });

  describe('deleteByUserId', () => {
    it('should call prisma.oAuthSession.deleteMany with clientId', async () => {
      mockPrisma.oAuthSession.deleteMany.mockResolvedValue({ count: 1 });

      await repo.deleteByUserId('user-1');

      expect(mockPrisma.oAuthSession.deleteMany).toHaveBeenCalledWith({
        where: { clientId: 'user-1' },
      });
    });
  });

  describe('toDomain mapping', () => {
    it('should map null encryptedToken to undefined', async () => {
      mockPrisma.oAuthSession.findUnique.mockResolvedValue({
        ...mockRow,
        encryptedToken: null,
      });

      const result = await repo.findByState('state-abc');

      expect(result!.encryptedToken).toBeUndefined();
    });

    it('should map null wabaId to undefined', async () => {
      mockPrisma.oAuthSession.findUnique.mockResolvedValue({
        ...mockRow,
        wabaId: null,
      });

      const result = await repo.findByState('state-abc');

      expect(result!.wabaId).toBeUndefined();
    });

    it('should map null phoneNumberId to undefined', async () => {
      mockPrisma.oAuthSession.findUnique.mockResolvedValue({
        ...mockRow,
        phoneNumberId: null,
      });

      const result = await repo.findByState('state-abc');

      expect(result!.phoneNumberId).toBeUndefined();
    });
  });
});
