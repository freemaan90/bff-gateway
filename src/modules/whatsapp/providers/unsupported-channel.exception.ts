import { BadRequestException } from '@nestjs/common';

export class UnsupportedChannelException extends BadRequestException {
  constructor(channelType: string) {
    super(`Unsupported channel type: ${channelType}`);
  }
}
