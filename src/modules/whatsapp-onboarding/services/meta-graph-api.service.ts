import { Injectable, BadGatewayException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { envs } from '../../../config/envs';
import {
  MetaBusiness,
  MetaListResponse,
  MetaPhoneNumber,
  MetaTokenResponse,
  MetaWaba,
} from '../dto/meta-graph-api.types';

const META_BASE_URL = 'https://graph.facebook.com/v21.0';

@Injectable()
export class MetaGraphApiService {
  private readonly logger = new Logger(MetaGraphApiService.name);

  constructor(private readonly httpService: HttpService) {}

  async exchangeCodeForShortLivedToken(
    code: string,
    verifier: string,
    redirectUri: string,
  ): Promise<string> {
    const params = new URLSearchParams({
      client_id: envs.metaAppId,
      client_secret: envs.metaAppSecret,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post<MetaTokenResponse>(
          `${META_BASE_URL}/oauth/access_token`,
          params.toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      );

      const data = response.data;
      if (!data?.access_token || typeof data.access_token !== 'string') {
        throw new BadGatewayException('meta_invalid_response: access_token');
      }

      return data.access_token;
    } catch (error: any) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.warn('Meta token exchange failed', {
        error_code: error?.response?.data?.error?.code,
        error_subcode: error?.response?.data?.error?.error_subcode,
        message: error?.response?.data?.error?.message,
      });
      throw new BadGatewayException(
        `meta_token_exchange_failed: ${error?.response?.data?.error?.message ?? error.message}`,
      );
    }
  }

  async exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: envs.metaAppId,
      client_secret: envs.metaAppSecret,
      fb_exchange_token: shortLivedToken,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.get<MetaTokenResponse>(
          `${META_BASE_URL}/oauth/access_token`,
          { params: Object.fromEntries(params) },
        ),
      );

      const data = response.data;
      if (!data?.access_token || typeof data.access_token !== 'string') {
        throw new BadGatewayException('meta_invalid_response: access_token');
      }

      return data.access_token;
    } catch (error: any) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.warn('Meta long-lived token exchange failed', {
        error_code: error?.response?.data?.error?.code,
        error_subcode: error?.response?.data?.error?.error_subcode,
        message: error?.response?.data?.error?.message,
      });
      throw new BadGatewayException(
        `meta_token_exchange_failed: ${error?.response?.data?.error?.message ?? error.message}`,
      );
    }
  }

  async getBusinesses(accessToken: string): Promise<MetaBusiness[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<MetaListResponse<MetaBusiness>>(
          `${META_BASE_URL}/me/businesses`,
          { params: { access_token: accessToken } },
        ),
      );

      const data = response.data;
      if (!data || !Array.isArray(data.data)) {
        throw new BadGatewayException('meta_invalid_response: data');
      }

      for (const business of data.data) {
        if (!business.id || typeof business.id !== 'string') {
          throw new BadGatewayException('meta_invalid_response: business.id');
        }
        if (!business.name || typeof business.name !== 'string') {
          throw new BadGatewayException('meta_invalid_response: business.name');
        }
      }

      return data.data;
    } catch (error: any) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.warn('Meta getBusinesses failed', {
        error_code: error?.response?.data?.error?.code,
        error_subcode: error?.response?.data?.error?.error_subcode,
        message: error?.response?.data?.error?.message,
      });
      throw new BadGatewayException(
        `meta_api_error: ${error?.response?.data?.error?.message ?? error.message}`,
      );
    }
  }

  async getWabaAccounts(
    businessId: string,
    accessToken: string,
  ): Promise<MetaWaba[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<MetaListResponse<MetaWaba>>(
          `${META_BASE_URL}/${businessId}/owned_whatsapp_business_accounts`,
          { params: { access_token: accessToken } },
        ),
      );

      const data = response.data;
      if (!data || !Array.isArray(data.data)) {
        throw new BadGatewayException('meta_invalid_response: data');
      }

      for (const waba of data.data) {
        if (!waba.id || typeof waba.id !== 'string') {
          throw new BadGatewayException('meta_invalid_response: waba.id');
        }
        if (!waba.name || typeof waba.name !== 'string') {
          throw new BadGatewayException('meta_invalid_response: waba.name');
        }
        if (!waba.currency || typeof waba.currency !== 'string') {
          throw new BadGatewayException('meta_invalid_response: waba.currency');
        }
        if (!waba.timezone_id || typeof waba.timezone_id !== 'string') {
          throw new BadGatewayException('meta_invalid_response: waba.timezone_id');
        }
      }

      return data.data;
    } catch (error: any) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.warn('Meta getWabaAccounts failed', {
        error_code: error?.response?.data?.error?.code,
        error_subcode: error?.response?.data?.error?.error_subcode,
        message: error?.response?.data?.error?.message,
      });
      throw new BadGatewayException(
        `meta_api_error: ${error?.response?.data?.error?.message ?? error.message}`,
      );
    }
  }

  async getPhoneNumbers(
    wabaId: string,
    accessToken: string,
  ): Promise<MetaPhoneNumber[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<MetaListResponse<MetaPhoneNumber>>(
          `${META_BASE_URL}/${wabaId}/phone_numbers`,
          { params: { access_token: accessToken } },
        ),
      );

      const data = response.data;
      if (!data || !Array.isArray(data.data)) {
        throw new BadGatewayException('meta_invalid_response: data');
      }

      for (const phone of data.data) {
        if (!phone.id || typeof phone.id !== 'string') {
          throw new BadGatewayException('meta_invalid_response: phone.id');
        }
        if (
          !phone.display_phone_number ||
          typeof phone.display_phone_number !== 'string'
        ) {
          throw new BadGatewayException(
            'meta_invalid_response: phone.display_phone_number',
          );
        }
        if (!phone.verified_name || typeof phone.verified_name !== 'string') {
          throw new BadGatewayException(
            'meta_invalid_response: phone.verified_name',
          );
        }
      }

      return data.data;
    } catch (error: any) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.warn('Meta getPhoneNumbers failed', {
        error_code: error?.response?.data?.error?.code,
        error_subcode: error?.response?.data?.error?.error_subcode,
        message: error?.response?.data?.error?.message,
      });
      throw new BadGatewayException(
        `meta_api_error: ${error?.response?.data?.error?.message ?? error.message}`,
      );
    }
  }
}
