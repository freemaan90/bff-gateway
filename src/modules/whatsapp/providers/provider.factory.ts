import { HttpService } from '@nestjs/axios';
import { ClientProxy } from '@nestjs/microservices';
import { IMessageProvider } from './message-provider.interface';
import { OfficialWhatsappProvider, WabaConfig } from './official-whatsapp.provider';
import { UnofficialWhatsappProvider } from './unofficial-whatsapp.provider';
import { UnsupportedChannelException } from './unsupported-channel.exception';

export type ProviderConfig =
  | {
      type: 'OFFICIAL';
      httpService: HttpService;
      wabaConfig: WabaConfig;
    }
  | {
      type: 'UNOFFICIAL';
      tcpClient: ClientProxy;
      sessionId: string;
    };

export class ProviderFactory {
  static create(channelType: string, config: ProviderConfig): IMessageProvider {
    if (channelType === 'OFFICIAL' && config.type === 'OFFICIAL') {
      return new OfficialWhatsappProvider(config.httpService, config.wabaConfig);
    }

    if (channelType === 'UNOFFICIAL' && config.type === 'UNOFFICIAL') {
      return new UnofficialWhatsappProvider(config.tcpClient, config.sessionId);
    }

    throw new UnsupportedChannelException(channelType);
  }
}
