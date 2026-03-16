// Feature: whatsapp-official-api-integration, Property 4: accessToken encryption round-trip
import * as fc from 'fast-check';
import { EncryptionService } from './encryption.service';

const VALID_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

function makeService(): EncryptionService {
  process.env.ENCRYPTION_KEY = VALID_KEY;
  return new EncryptionService();
}

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    service = makeService();
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  describe('constructor', () => {
    it('throws when ENCRYPTION_KEY is missing', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => new EncryptionService()).toThrow('ENCRYPTION_KEY environment variable is not defined');
    });

    it('throws when ENCRYPTION_KEY is not 64 chars', () => {
      process.env.ENCRYPTION_KEY = 'abc123';
      expect(() => new EncryptionService()).toThrow('ENCRYPTION_KEY must be 64 hex characters');
    });
  });

  describe('encrypt / decrypt', () => {
    it('round-trips a known string', () => {
      const plaintext = 'EAAxxxxxxxxxxxxxxx_test_token';
      const ciphertext = service.encrypt(plaintext);
      expect(service.decrypt(ciphertext)).toBe(plaintext);
    });

    it('produces different ciphertexts for the same input (random IV)', () => {
      const plaintext = 'same_token';
      const c1 = service.encrypt(plaintext);
      const c2 = service.encrypt(plaintext);
      expect(c1).not.toBe(c2);
    });

    it('ciphertext format is iv:authTag:encrypted (3 base64 parts)', () => {
      const ciphertext = service.encrypt('hello');
      const parts = ciphertext.split(':');
      expect(parts).toHaveLength(3);
      parts.forEach((part) => {
        expect(() => Buffer.from(part, 'base64')).not.toThrow();
      });
    });

    // Property 4: accessToken encryption round-trip
    it('Property 4 — round-trip holds for arbitrary strings', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 20, maxLength: 500 }), (token) => {
          const ciphertext = service.encrypt(token);
          const decrypted = service.decrypt(ciphertext);
          return decrypted === token;
        }),
      );
    });

    it('Property 4 — round-trip holds for unicode strings', () => {
      fc.assert(
        fc.property(
          fc.string({ unit: 'grapheme', minLength: 1, maxLength: 200 }),
          (token) => {
            const ciphertext = service.encrypt(token);
            return service.decrypt(ciphertext) === token;
          },
        ),
      );
    });
  });
});
