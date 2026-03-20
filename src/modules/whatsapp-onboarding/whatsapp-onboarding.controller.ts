import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WhatsappOnboardingService } from './services/whatsapp-onboarding.service';
import { CallbackQueryDto } from './dto/callback-query.dto';
import { SelectWabaDto } from './dto/select-waba.dto';
import { SelectPhoneDto } from './dto/select-phone.dto';

@Controller('whatsapp-onboarding')
export class WhatsappOnboardingController {
  constructor(private readonly service: WhatsappOnboardingService) {}

  /** Req 1.5: Inicia el flujo OAuth — retorna authorizationUrl */
  @UseGuards(JwtAuthGuard)
  @Post('authorize')
  authorize(@Req() req: any) {
    return this.service.authorize(req.user.id);
  }

  /** Req 2.1: Callback público — Meta redirige aquí con code + state */
  @Get('oauth/callback')
  handleCallback(@Query() query: CallbackQueryDto) {
    return this.service.handleCallback(query);
  }

  /** Req 4.4: Selección manual de WABA cuando hay múltiples */
  @UseGuards(JwtAuthGuard)
  @Post('select-waba')
  selectWaba(@Req() req: any, @Body() dto: SelectWabaDto) {
    return this.service.selectWaba(req.user.id, dto);
  }

  /** Req 4.7: Selección manual de phone number cuando hay múltiples */
  @UseGuards(JwtAuthGuard)
  @Post('select-phone')
  selectPhone(@Req() req: any, @Body() dto: SelectPhoneDto) {
    return this.service.selectPhone(req.user.id, dto);
  }

  /** Req 6.1: Consulta el estado actual del flujo OAuth */
  @UseGuards(JwtAuthGuard)
  @Get('status')
  getStatus(@Req() req: any) {
    return this.service.getStatus(req.user.id);
  }

  /** Req 7.1: Cancela la sesión OAuth activa */
  @UseGuards(JwtAuthGuard)
  @Delete('session')
  @HttpCode(204)
  cancelSession(@Req() req: any) {
    return this.service.cancelSession(req.user.id);
  }
}
