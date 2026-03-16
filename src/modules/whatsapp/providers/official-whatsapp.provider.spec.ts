// Feature: whatsapp-official-api-integration — OfficialWhatsappProvider unit tests
// Validates: Requirements 3.1, 3.3, 4.1
import { of, throwError } from 'rxjs';
import { OfficialWhatsappProvider, WabaConfig } from './official-whatsapp.provider';

const WABA_CONFIG: WabaConfig = {
  phoneNumberId: '123456789',
  accessToken: 'EAAtest_token',
  wabaId: '987654321',
};

function makeHttpService(response: any) {
  return {
    post: jest.fn().mockReturnValue(of({ data: response })),
  } as any;
}

function makeHttpServiceError(errorData: any) {
  return {
    post: jest.fn().mockReturnValue(
      throwError(() => ({ response: { data: errorData }, message: 'Request failed' })),
    ),
  } as any;
}

describe('OfficialWhatsappProvider', () => {
  describe('sendMessage — free-form', () => {
    it('sends correct payload to Meta API', async () => {
      const httpService = makeHttpService({ messages: [{ id: 'wamid.abc123' }] });
      const provider = new OfficialWhatsappProvider(httpService, WABA_CONFIG);

      await provider.sendMessage('5491112345678', 'Hola mundo');

      expect(httpService.post).toHaveBeenCalledWith(
        `https://graph.facebook.com/v17.0/${WABA_CONFIG.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: '5491112345678',
          type: 'text',
          text: { body: 'Hola mundo' },
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${WABA_CONFIG.accessToken}`,
          }),
        }),
      );
    });

    it('returns success=true and wamid on 2xx', async () => {
      const httpService = makeHttpService({ messages: [{ id: 'wamid.abc123' }] });
      const provider = new OfficialWhatsappProvider(httpService, WABA_CONFIG);

      const result = await provider.sendMessage('5491112345678', 'Hola');

      expect(result.success).toBe(true);
      expect(result.wamid).toBe('wamid.abc123');
    });

    it('returns success=false and error on 4xx/5xx', async () => {
      const httpService = makeHttpServiceError({ error: { message: 'Invalid phone' } });
      const provider = new OfficialWhatsappProvider(httpService, WABA_CONFIG);

      const result = await provider.sendMessage('invalid', 'Hola');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('sendMessage — template (HSM)', () => {
    it('sends correct template payload to Meta API', async () => {
      const httpService = makeHttpService({ messages: [{ id: 'wamid.tmpl001' }] });
      const provider = new OfficialWhatsappProvider(httpService, WABA_CONFIG);

      await provider.sendMessage('5491112345678', '', {
        templateName: 'hello_world',
        languageCode: 'es',
        templateComponents: [{ type: 'body', parameters: [{ type: 'text', text: 'Juan' }] }],
      });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        {
          messaging_product: 'whatsapp',
          to: '5491112345678',
          type: 'template',
          template: {
            name: 'hello_world',
            language: { code: 'es' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: 'Juan' }] }],
          },
        },
        expect.any(Object),
      );
    });

    it('returns wamid from template response', async () => {
      const httpService = makeHttpService({ messages: [{ id: 'wamid.tmpl001' }] });
      const provider = new OfficialWhatsappProvider(httpService, WABA_CONFIG);

      const result = await provider.sendMessage('5491112345678', '', {
        templateName: 'hello_world',
        languageCode: 'es',
      });

      expect(result.success).toBe(true);
      expect(result.wamid).toBe('wamid.tmpl001');
    });

    it('uses empty array for templateComponents when not provided', async () => {
      const httpService = makeHttpService({ messages: [{ id: 'wamid.x' }] });
      const provider = new OfficialWhatsappProvider(httpService, WABA_CONFIG);

      await provider.sendMessage('5491112345678', '', {
        templateName: 'hello_world',
        languageCode: 'en',
      });

      const callPayload = httpService.post.mock.calls[0][1];
      expect(callPayload.template.components).toEqual([]);
    });

    it('returns success=false on template send error', async () => {
      const httpService = makeHttpServiceError({ error: { message: 'Template not found' } });
      const provider = new OfficialWhatsappProvider(httpService, WABA_CONFIG);

      const result = await provider.sendMessage('5491112345678', '', {
        templateName: 'nonexistent',
        languageCode: 'es',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Template not found');
    });
  });
});
