import { MetaPhoneNumber, MetaWaba } from './meta-graph-api.types';

export class CallbackResultDto {
  status?: string;
  sessionId?: string;
  wabas?: MetaWaba[];
  phones?: MetaPhoneNumber[];
  whatsappSessionId?: string;
}
