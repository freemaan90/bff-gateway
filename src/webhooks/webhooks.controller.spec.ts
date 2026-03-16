// Feature: whatsapp-official-api-integration — WebhooksController unit tests
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

const VERIFY_TOKEN = 'test_verify_token_abc';

function makeService() {
  return {
    verifyWebhook: jest.fn(),
    handleWebhookEvent: jest.fn().mockResolvedValue(undefined),
  };
}

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let service: ReturnType<typeof makeService>;

  beforeEach(async () => {
    service = makeService();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [{ provide: WebhooksService, useValue: service }],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  describe('GET /webhooks/whatsapp — verification', () => {
    it('returns hub.challenge when token matches', () => {
      service.verifyWebhook.mockReturnValue('challenge_abc123');

      const result = controller.verifyWebhook({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'challenge_abc123',
      });

      expect(result).toBe('challenge_abc123');
    });

    it('throws ForbiddenException when token does not match', () => {
      service.verifyWebhook.mockReturnValue(null);

      expect(() =>
        controller.verifyWebhook({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_token',
          'hub.challenge': 'challenge_abc123',
        }),
      ).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when hub.mode is not subscribe', () => {
      service.verifyWebhook.mockReturnValue(null);

      expect(() =>
        controller.verifyWebhook({
          'hub.mode': 'unsubscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': 'challenge_abc123',
        }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('POST /webhooks/whatsapp — event handling', () => {
    it('returns { status: "ok" } for valid payload', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [{ id: 'wamid.abc123', status: 'delivered' }],
                },
              },
            ],
          },
        ],
      };

      const result = await controller.handleWebhook(payload);
      expect(result).toEqual({ status: 'ok' });
      expect(service.handleWebhookEvent).toHaveBeenCalledWith(payload);
    });

    it('returns { status: "ok" } for malformed payload (does not throw)', async () => {
      service.handleWebhookEvent.mockResolvedValue(undefined);

      const result = await controller.handleWebhook({ garbage: true });
      expect(result).toEqual({ status: 'ok' });
    });

    it('returns { status: "ok" } for empty body', async () => {
      const result = await controller.handleWebhook({});
      expect(result).toEqual({ status: 'ok' });
    });

    it('returns { status: "ok" } even when service throws internally', async () => {
      service.handleWebhookEvent.mockResolvedValue(undefined);
      const result = await controller.handleWebhook(null);
      expect(result).toEqual({ status: 'ok' });
    });
  });
});
