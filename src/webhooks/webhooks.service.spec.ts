// Feature: whatsapp-official-api-integration
// Property 12: Webhook wamid delivery status update
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
import * as fc from 'fast-check';
import { WebhooksService } from './webhooks.service';

const VERIFY_TOKEN = 'my_verify_token';

function makeRepo() {
  return {
    updateDeliveryStatus: jest.fn().mockResolvedValue(undefined),
  };
}

function makeService(repo = makeRepo()) {
  return { service: new WebhooksService(repo as any), repo };
}

describe('WebhooksService', () => {
  beforeEach(() => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
  });

  afterEach(() => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
  });

  describe('verifyWebhook', () => {
    it('returns challenge when mode=subscribe and token matches', () => {
      const { service } = makeService();
      const result = service.verifyWebhook({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'challenge_xyz',
      });
      expect(result).toBe('challenge_xyz');
    });

    it('returns null when token does not match', () => {
      const { service } = makeService();
      const result = service.verifyWebhook({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong',
        'hub.challenge': 'challenge_xyz',
      });
      expect(result).toBeNull();
    });

    it('returns null when mode is not subscribe', () => {
      const { service } = makeService();
      const result = service.verifyWebhook({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'challenge_xyz',
      });
      expect(result).toBeNull();
    });

    it('returns empty string when challenge is missing', () => {
      const { service } = makeService();
      const result = service.verifyWebhook({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
      });
      expect(result).toBe('');
    });
  });

  describe('handleWebhookEvent', () => {
    it('calls updateDeliveryStatus for each status in payload', async () => {
      const { service, repo } = makeService();
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    { id: 'wamid.abc', status: 'delivered' },
                    { id: 'wamid.def', status: 'read' },
                  ],
                },
              },
            ],
          },
        ],
      };

      await service.handleWebhookEvent(payload);

      expect(repo.updateDeliveryStatus).toHaveBeenCalledTimes(2);
      expect(repo.updateDeliveryStatus).toHaveBeenCalledWith('wamid.abc', 'delivered');
      expect(repo.updateDeliveryStatus).toHaveBeenCalledWith('wamid.def', 'read');
    });

    it('does not throw for invalid payload (missing object)', async () => {
      const { service } = makeService();
      await expect(service.handleWebhookEvent({ garbage: true })).resolves.not.toThrow();
    });

    it('does not throw for null payload', async () => {
      const { service } = makeService();
      await expect(service.handleWebhookEvent(null)).resolves.not.toThrow();
    });

    it('does not throw for empty entry array', async () => {
      const { service } = makeService();
      await expect(
        service.handleWebhookEvent({ object: 'whatsapp_business_account', entry: [] }),
      ).resolves.not.toThrow();
    });

    it('does not call updateDeliveryStatus when statuses array is empty', async () => {
      const { service, repo } = makeService();
      await service.handleWebhookEvent({
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ value: { statuses: [] } }] }],
      });
      expect(repo.updateDeliveryStatus).not.toHaveBeenCalled();
    });

    // Property 12: Webhook wamid delivery status update
    it('Property 12 — updateDeliveryStatus called once per status entry', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 5, maxLength: 50 }),
              status: fc.constantFrom('sent', 'delivered', 'read', 'failed'),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          async (statuses) => {
            const repo = makeRepo();
            const { service } = makeService(repo);

            await service.handleWebhookEvent({
              object: 'whatsapp_business_account',
              entry: [{ changes: [{ value: { statuses } }] }],
            });

            return repo.updateDeliveryStatus.mock.calls.length === statuses.length;
          },
        ),
      );
    });
  });
});
