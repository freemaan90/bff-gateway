// Feature: whatsapp-official-api-integration, Property 11: ProviderFactory routes by channelType
// Validates: Requirements 7.4, 7.5
import * as fc from 'fast-check';
import { of } from 'rxjs';
import { ProviderFactory } from './provider.factory';
import { OfficialWhatsappProvider } from './official-whatsapp.provider';
import { UnofficialWhatsappProvider } from './unofficial-whatsapp.provider';
import { UnsupportedChannelException } from './unsupported-channel.exception';

const mockHttpService = {
  post: jest.fn().mockReturnValue(of({ data: {} })),
} as any;

const mockTcpClient = {
  send: jest.fn().mockReturnValue(of({})),
} as any;

describe('ProviderFactory', () => {
  describe('create — OFFICIAL', () => {
    it('returns OfficialWhatsappProvider for OFFICIAL channelType', () => {
      const provider = ProviderFactory.create('OFFICIAL', {
        type: 'OFFICIAL',
        httpService: mockHttpService,
        wabaConfig: { phoneNumberId: '123', accessToken: 'token', wabaId: '456' },
      });
      expect(provider).toBeInstanceOf(OfficialWhatsappProvider);
    });
  });

  describe('create — UNOFFICIAL', () => {
    it('returns UnofficialWhatsappProvider for UNOFFICIAL channelType', () => {
      const provider = ProviderFactory.create('UNOFFICIAL', {
        type: 'UNOFFICIAL',
        tcpClient: mockTcpClient,
        sessionId: 'sess_001',
      });
      expect(provider).toBeInstanceOf(UnofficialWhatsappProvider);
    });
  });

  describe('create — unsupported', () => {
    it('throws UnsupportedChannelException for unknown channelType', () => {
      expect(() =>
        ProviderFactory.create('UNKNOWN', {
          type: 'UNOFFICIAL',
          tcpClient: mockTcpClient,
          sessionId: 'sess_001',
        }),
      ).toThrow(UnsupportedChannelException);
    });

    it('throws UnsupportedChannelException for empty string', () => {
      expect(() =>
        ProviderFactory.create('', {
          type: 'UNOFFICIAL',
          tcpClient: mockTcpClient,
          sessionId: 'sess_001',
        }),
      ).toThrow(UnsupportedChannelException);
    });
  });

  // Property 11: ProviderFactory routes by channelType
  describe('Property 11 — routing is exhaustive for valid types', () => {
    it('always returns OfficialWhatsappProvider for OFFICIAL config', () => {
      fc.assert(
        fc.property(
          fc.record({
            phoneNumberId: fc.stringMatching(/^\d{5,15}$/),
            accessToken: fc.string({ minLength: 20, maxLength: 100 }),
            wabaId: fc.stringMatching(/^\d{5,15}$/),
          }),
          (wabaConfig) => {
            const provider = ProviderFactory.create('OFFICIAL', {
              type: 'OFFICIAL',
              httpService: mockHttpService,
              wabaConfig,
            });
            return provider instanceof OfficialWhatsappProvider;
          },
        ),
      );
    });

    it('always returns UnofficialWhatsappProvider for UNOFFICIAL config', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (sessionId) => {
            const provider = ProviderFactory.create('UNOFFICIAL', {
              type: 'UNOFFICIAL',
              tcpClient: mockTcpClient,
              sessionId,
            });
            return provider instanceof UnofficialWhatsappProvider;
          },
        ),
      );
    });

    it('always throws for arbitrary non-standard channelType strings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }).filter(
            (s) => s !== 'OFFICIAL' && s !== 'UNOFFICIAL',
          ),
          (channelType) => {
            expect(() =>
              ProviderFactory.create(channelType, {
                type: 'UNOFFICIAL',
                tcpClient: mockTcpClient,
                sessionId: 'sess',
              }),
            ).toThrow(UnsupportedChannelException);
            return true;
          },
        ),
      );
    });
  });
});
