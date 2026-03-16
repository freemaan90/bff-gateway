// Feature: whatsapp-official-api-integration
// Property 3: accessToken never appears in API responses
// Property 15: Session ownership authorization
// Validates: Requirements 9.1, 9.5
import * as fc from 'fast-check';
import { WhatsappSessionEntity } from './whatsapp-session.entity';

function makeEntity(overrides: Partial<WhatsappSessionEntity> = {}): WhatsappSessionEntity {
  return new WhatsappSessionEntity({
    id: 'id-001',
    sessionId: null,
    userId: 'user-1',
    phoneNumber: '5491112345678',
    channelType: 'OFFICIAL',
    phoneNumberId: '123456789',
    accessToken: 'EAAsuper_secret_token',
    wabaId: '987654321',
    isActive: true,
    isReady: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('WhatsappSessionEntity', () => {
  // Property 3: accessToken never appears in API responses
  describe('Property 3 — toJSON never exposes accessToken', () => {
    it('toJSON does not include accessToken field', () => {
      const entity = makeEntity();
      const json = entity.toJSON();
      expect(json).not.toHaveProperty('accessToken');
    });

    it('toJSON does not include accessToken value in any field', () => {
      const entity = makeEntity({ accessToken: 'EAAsuper_secret_token' });
      const json = entity.toJSON();
      const serialized = JSON.stringify(json);
      expect(serialized).not.toContain('EAAsuper_secret_token');
    });

    it('Property 3 — fc: toJSON never contains accessToken for arbitrary tokens', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 20, maxLength: 200 }),
          (accessToken) => {
            const entity = makeEntity({ accessToken });
            const json = entity.toJSON();
            const serialized = JSON.stringify(json);
            return !serialized.includes(accessToken) && !('accessToken' in json);
          },
        ),
      );
    });
  });

  // Property 15: Session ownership authorization
  describe('Property 15 — session ownership', () => {
    it('entity preserves userId for ownership checks', () => {
      const entity = makeEntity({ userId: 'owner-user' });
      expect(entity.userId).toBe('owner-user');
    });

    it('Property 15 — fc: userId is always preserved through entity construction', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (userId) => {
            const entity = makeEntity({ userId });
            return entity.userId === userId;
          },
        ),
      );
    });

    it('toJSON includes userId for ownership verification', () => {
      const entity = makeEntity({ userId: 'user-abc' });
      const json = entity.toJSON();
      expect(json.userId).toBe('user-abc');
    });
  });

  describe('getStatus', () => {
    it('returns CONNECTED when isReady=true', () => {
      const entity = makeEntity({ isReady: true, isActive: true });
      expect(entity.getStatus()).toBe('connected');
    });

    it('returns WAITING_QR when isActive=true and isReady=false for unofficial', () => {
      const entity = makeEntity({ isReady: false, isActive: true, channelType: 'UNOFFICIAL' });
      expect(entity.getStatus()).toBe('waiting_qr');
    });

    it('returns INACTIVE when isActive=false', () => {
      const entity = makeEntity({ isActive: false, isReady: false });
      expect(entity.getStatus()).toBe('inactive');
    });
  });
});
