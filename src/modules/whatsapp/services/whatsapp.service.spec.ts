// Feature: whatsapp-official-api-integration, Properties 5-10
import * as fc from 'fast-check';
import { BadGatewayException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSessionEntity } from '../domain/whatsapp-session.entity';
import * as providerFactoryModule from '../providers/provider.factory';

function makeSession(o = {}) {
  return new WhatsappSessionEntity({
    id: 'sess-db-id', sessionId: null, userId: 'user-1',
    phoneNumber: '5491112345678', channelType: 'OFFICIAL',
    phoneNumberId: '123456789', accessToken: 'encrypted_token',
    wabaId: '987654321', isActive: true, isReady: true,
    createdAt: new Date(), updatedAt: new Date(), ...o,
  });
}

function makeRepos(session = makeSession()) {
  return {
    sessionRepository: {
      findById: jest.fn().mockResolvedValue(session),
      findByUserIdAndSessionId: jest.fn().mockResolvedValue(null),
      decryptAccessToken: jest.fn().mockReturnValue('plain_token'),
    },
    messageLogRepository: { create: jest.fn().mockResolvedValue({}) },
    failedMessageLogRepository: { create: jest.fn().mockResolvedValue({}) },
    activityRepository: { create: jest.fn().mockResolvedValue({}) },
  };
}

function buildService(repos, mockProvider) {
  jest.spyOn(providerFactoryModule.ProviderFactory, 'create').mockReturnValue(mockProvider);
  return new WhatsappService(
    repos.sessionRepository, repos.activityRepository,
    repos.messageLogRepository, repos.failedMessageLogRepository, { post: jest.fn() },
  );
}

describe('WhatsappService', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('Property 5: success creates MessageLog channelType=OFFICIAL', async () => {
    const repos = makeRepos();
    const provider = { sendMessage: jest.fn().mockResolvedValue({ success: true, wamid: 'wamid.abc' }) };
    const service = buildService(repos, provider);
    await service.sendMessage('user-1', 'sess-db-id', '5491100000000', 'hello');
    expect(repos.messageLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ channelType: 'OFFICIAL' }),
    );
  });

  it('Property 6: failure creates FailedMessageLog channelType=OFFICIAL', async () => {
    const repos = makeRepos();
    const provider = { sendMessage: jest.fn().mockResolvedValue({ success: false, error: 'Meta error' }) };
    const service = buildService(repos, provider);
    await expect(service.sendMessage('user-1', 'sess-db-id', '5491100000000', 'hello')).rejects.toThrow(BadGatewayException);
    expect(repos.failedMessageLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ channelType: 'OFFICIAL' }),
    );
  });

  it('Property 7: template send logs [TEMPLATE] prefix', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 3, maxLength: 30 }), async (templateName) => {
        const repos = makeRepos();
        const provider = { sendMessage: jest.fn().mockResolvedValue({ success: true, wamid: 'wamid.t' }) };
        const service = buildService(repos, provider);
        await service.sendMessage('user-1', 'sess-db-id', '5491100000000', '', { templateName, languageCode: 'es' });
        const arg = repos.messageLogRepository.create.mock.calls[0][0];
        return arg.messageText === '[TEMPLATE]' + templateName;
      }),
      { numRuns: 10 },
    );
  });

  it('Property 8: templateComponents passed through to provider', async () => {
    const repos = makeRepos();
    const provider = { sendMessage: jest.fn().mockResolvedValue({ success: true, wamid: 'wamid.c' }) };
    const service = buildService(repos, provider);
    const components = [{ type: 'body', parameters: [{ type: 'text', text: 'hi' }] }];
    await service.sendMessage('user-1', 'sess-db-id', '5491100000000', '', {
      templateName: 'tmpl', languageCode: 'es', templateComponents: components,
    });
    expect(provider.sendMessage).toHaveBeenCalledWith(
      '5491100000000', '', expect.objectContaining({ templateComponents: components }),
    );
  });

  it('throws NotFoundException when session not found', async () => {
    const repos = makeRepos(null);
    const service = buildService(repos, { sendMessage: jest.fn() });
    await expect(service.sendMessage('user-1', 'missing', '5491100000000', 'hi')).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException for wrong user', async () => {
    const repos = makeRepos(makeSession({ userId: 'other' }));
    const service = buildService(repos, { sendMessage: jest.fn() });
    await expect(service.sendMessage('user-1', 'sess-db-id', '5491100000000', 'hi')).rejects.toThrow(ForbiddenException);
  });

  it('Property 9: bulk summary counts match actual results', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), async (flags) => {
        jest.restoreAllMocks();
        const phones = flags.map((_, i) => '54911000000' + i);
        const results = flags.map((ok) => ok ? { success: true, wamid: 'w' } : { success: false, error: 'e' });
        const repos = makeRepos();
        let idx = 0;
        const provider = {
          sendMessage: jest.fn().mockImplementation(() => {
            const r = results[idx++];
            return Promise.resolve(r);
          }),
        };
        jest.spyOn(global, 'setTimeout').mockImplementation((fn) => { fn(); return 0; });
        const service = buildService(repos, provider);
        const summary = await service.bulkSend('user-1', 'sess-db-id', phones, 'hello');
        return summary.total === phones.length &&
          summary.successful === flags.filter(Boolean).length &&
          summary.failed === flags.filter((v) => !v).length;
      }),
      { numRuns: 15 },
    );
  });

  it('Property 10: bulk continues after individual failure', async () => {
    jest.restoreAllMocks();
    const repos = makeRepos();
    let idx = 0;
    const results = [
      { success: false, error: 'first failed' },
      { success: true, wamid: 'wamid.second' },
      { success: true, wamid: 'wamid.third' },
    ];
    const provider = {
      sendMessage: jest.fn().mockImplementation(() => Promise.resolve(results[idx++])),
    };
    jest.spyOn(global, 'setTimeout').mockImplementation((fn) => { fn(); return 0; });
    const service = buildService(repos, provider);
    const result = await service.bulkSend('user-1', 'sess-db-id', ['111', '222', '333'], 'msg');
    expect(result).toEqual({ total: 3, successful: 2, failed: 1 });
    expect(repos.messageLogRepository.create).toHaveBeenCalledTimes(2);
    expect(repos.failedMessageLogRepository.create).toHaveBeenCalledTimes(1);
  });
});
