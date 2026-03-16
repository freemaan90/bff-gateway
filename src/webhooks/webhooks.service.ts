import { Injectable, Logger } from '@nestjs/common';
import { MessageLogRepository } from '../modules/whatsapp/repositories/message-log.repository';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly messageLogRepository: MessageLogRepository,
  ) {}

  verifyWebhook(query: {
    'hub.mode'?: string;
    'hub.verify_token'?: string;
    'hub.challenge'?: string;
  }): string | null {
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === verifyToken
    ) {
      return query['hub.challenge'] ?? '';
    }
    return null;
  }

  async handleWebhookEvent(body: any): Promise<void> {
    try {
      // Validate basic Meta webhook structure
      if (!body?.object || !Array.isArray(body?.entry)) {
        this.logger.warn('Received invalid Meta webhook payload — ignoring');
        return;
      }

      // Extract status updates from the payload
      for (const entry of body.entry) {
        for (const change of entry?.changes ?? []) {
          const statuses = change?.value?.statuses ?? [];
          for (const status of statuses) {
            const wamid: string | undefined = status?.id;
            const statusValue: string | undefined = status?.status;

            if (wamid && statusValue) {
              await this.messageLogRepository.updateDeliveryStatus(wamid, statusValue);
              this.logger.log(`Webhook: updated delivery status for wamid=${wamid} status=${statusValue}`);
            }
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to process webhook event: ${error?.message ?? error}`);
      // Do not rethrow — always return 200 to Meta
    }
  }
}
