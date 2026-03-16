import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get('whatsapp')
  verifyWebhook(@Query() query: Record<string, string>): string {
    const challenge = this.webhooksService.verifyWebhook(query);
    if (challenge === null) {
      throw new ForbiddenException('Invalid webhook verification token');
    }
    return challenge;
  }

  @Post('whatsapp')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: any): Promise<{ status: string }> {
    await this.webhooksService.handleWebhookEvent(body);
    return { status: 'ok' };
  }
}
