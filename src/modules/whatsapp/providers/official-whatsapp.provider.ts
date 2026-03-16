import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  IMessageProvider,
  SendMessageOptions,
  SendResult,
} from './message-provider.interface';

export interface WabaConfig {
  phoneNumberId: string;
  accessToken: string;
  wabaId: string;
}

export class OfficialWhatsappProvider implements IMessageProvider {
  constructor(
    private readonly httpService: HttpService,
    private readonly wabaConfig: WabaConfig,
  ) {}

  async sendMessage(
    phone: string,
    message: string,
    options?: SendMessageOptions,
  ): Promise<SendResult> {
    const { phoneNumberId, accessToken } = this.wabaConfig;
    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

    const payload = options?.templateName
      ? {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: options.templateName,
            language: { code: options.languageCode },
            components: options.templateComponents ?? [],
          },
        }
      : {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: message },
        };

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      return {
        success: true,
        wamid: response.data?.messages?.[0]?.id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: JSON.stringify(error.response?.data ?? error.message),
      };
    }
  }
}
