import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  IMessageProvider,
  SendMessageOptions,
  SendResult,
} from './message-provider.interface';

export class UnofficialWhatsappProvider implements IMessageProvider {
  constructor(
    private readonly tcpClient: ClientProxy,
    private readonly sessionId: string,
  ) {}

  async sendMessage(
    phone: string,
    message: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options?: SendMessageOptions,
  ): Promise<SendResult> {
    try {
      await firstValueFrom(
        this.tcpClient.send(
          { cmd: 'whatsapp_sender_send_message' },
          { sessionId: this.sessionId, phone, message },
        ),
      );
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
