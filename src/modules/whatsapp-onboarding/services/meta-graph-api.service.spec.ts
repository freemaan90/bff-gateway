import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { BadGatewayException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { MetaGraphApiService } from './meta-graph-api.service';

// Mock envs before importing the service
jest.mock('../../../config/envs', () => ({
  envs: {
    metaAppId: 'test-app-id',
    metaAppSecret: 'test-app-secret',
    metaRedirectUri: 'https://example.com/callback',
  },
}));

const mockHttpService = {
  post: jest.fn(),
  get: jest.fn(),
};

describe('MetaGraphApiService', () => {
  let service: MetaGraphApiService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaGraphApiService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<MetaGraphApiService>(MetaGraphApiService);
  });

  // ─── exchangeCodeForShortLivedToken ───────────────────────────────────────

  describe('exchangeCodeForShortLivedToken', () => {
    it('should POST to the correct URL and return access_token', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: { access_token: 'short-token', token_type: 'bearer' } }),
      );

      const result = await service.exchangeCodeForShortLivedToken(
        'auth-code',
        'pkce-verifier',
        'https://example.com/callback',
      );

      expect(result).toBe('short-token');
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/oauth/access_token',
        expect.stringContaining('code=auth-code'),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
    });

    it('should include client_id, client_secret, redirect_uri, code_verifier in body', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: { access_token: 'short-token', token_type: 'bearer' } }),
      );

      await service.exchangeCodeForShortLivedToken(
        'my-code',
        'my-verifier',
        'https://redirect.example.com',
      );

      const body: string = mockHttpService.post.mock.calls[0][1];
      expect(body).toContain('client_id=test-app-id');
      expect(body).toContain('client_secret=test-app-secret');
      expect(body).toContain('redirect_uri=');
      expect(body).toContain('code_verifier=my-verifier');
    });

    it('should throw BadGatewayException when access_token is missing', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: { token_type: 'bearer' } }),
      );

      await expect(
        service.exchangeCodeForShortLivedToken('code', 'verifier', 'uri'),
      ).rejects.toThrow(BadGatewayException);

      await expect(
        service.exchangeCodeForShortLivedToken('code', 'verifier', 'uri'),
      ).rejects.toThrow('meta_invalid_response: access_token');
    });

    it('should throw BadGatewayException on HTTP error from Meta', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => ({
          response: {
            data: { error: { code: 190, message: 'Invalid OAuth access token' } },
          },
          message: 'Request failed',
        })),
      );

      await expect(
        service.exchangeCodeForShortLivedToken('code', 'verifier', 'uri'),
      ).rejects.toThrow(BadGatewayException);

      await expect(
        service.exchangeCodeForShortLivedToken('code', 'verifier', 'uri'),
      ).rejects.toThrow('meta_token_exchange_failed');
    });
  });

  // ─── exchangeForLongLivedToken ────────────────────────────────────────────

  describe('exchangeForLongLivedToken', () => {
    it('should GET with correct params and return access_token', async () => {
      mockHttpService.get.mockReturnValue(
        of({ data: { access_token: 'long-token', token_type: 'bearer' } }),
      );

      const result = await service.exchangeForLongLivedToken('short-token');

      expect(result).toBe('long-token');
      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/oauth/access_token',
        expect.objectContaining({
          params: expect.objectContaining({
            grant_type: 'fb_exchange_token',
            client_id: 'test-app-id',
            client_secret: 'test-app-secret',
            fb_exchange_token: 'short-token',
          }),
        }),
      );
    });

    it('should throw BadGatewayException when access_token is missing', async () => {
      mockHttpService.get.mockReturnValue(of({ data: {} }));

      await expect(
        service.exchangeForLongLivedToken('short-token'),
      ).rejects.toThrow('meta_invalid_response: access_token');
    });

    it('should throw BadGatewayException on HTTP error', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({
          response: { data: { error: { code: 190, message: 'Token expired' } } },
          message: 'Request failed',
        })),
      );

      await expect(
        service.exchangeForLongLivedToken('short-token'),
      ).rejects.toThrow('meta_token_exchange_failed');
    });
  });

  // ─── getBusinesses ────────────────────────────────────────────────────────

  describe('getBusinesses', () => {
    it('should GET /me/businesses and return businesses array', async () => {
      const businesses = [{ id: '123', name: 'My Business' }];
      mockHttpService.get.mockReturnValue(
        of({ data: { data: businesses } }),
      );

      const result = await service.getBusinesses('access-token');

      expect(result).toEqual(businesses);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/me/businesses',
        expect.objectContaining({ params: { access_token: 'access-token' } }),
      );
    });

    it('should throw BadGatewayException when data array is missing', async () => {
      mockHttpService.get.mockReturnValue(of({ data: {} }));

      await expect(service.getBusinesses('token')).rejects.toThrow(
        'meta_invalid_response: data',
      );
    });

    it('should throw BadGatewayException when business.id is missing', async () => {
      mockHttpService.get.mockReturnValue(
        of({ data: { data: [{ name: 'No ID Business' }] } }),
      );

      await expect(service.getBusinesses('token')).rejects.toThrow(
        'meta_invalid_response: business.id',
      );
    });

    it('should throw BadGatewayException when business.name is missing', async () => {
      mockHttpService.get.mockReturnValue(
        of({ data: { data: [{ id: '123' }] } }),
      );

      await expect(service.getBusinesses('token')).rejects.toThrow(
        'meta_invalid_response: business.name',
      );
    });

    it('should throw BadGatewayException on HTTP error', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({
          response: { data: { error: { code: 200, message: 'Permission denied' } } },
          message: 'Request failed',
        })),
      );

      await expect(service.getBusinesses('token')).rejects.toThrow(
        'meta_api_error',
      );
    });
  });

  // ─── getWabaAccounts ──────────────────────────────────────────────────────

  describe('getWabaAccounts', () => {
    const validWaba = {
      id: '456',
      name: 'My WABA',
      currency: 'USD',
      timezone_id: '1',
    };

    it('should GET /{businessId}/owned_whatsapp_business_accounts and return wabas', async () => {
      mockHttpService.get.mockReturnValue(
        of({ data: { data: [validWaba] } }),
      );

      const result = await service.getWabaAccounts('biz-123', 'access-token');

      expect(result).toEqual([validWaba]);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/biz-123/owned_whatsapp_business_accounts',
        expect.objectContaining({ params: { access_token: 'access-token' } }),
      );
    });

    it('should throw BadGatewayException when waba.id is missing', async () => {
      mockHttpService.get.mockReturnValue(
        of({ data: { data: [{ name: 'WABA', currency: 'USD', timezone_id: '1' }] } }),
      );

      await expect(service.getWabaAccounts('biz', 'token')).rejects.toThrow(
        'meta_invalid_response: waba.id',
      );
    });

    it('should throw BadGatewayException when waba.currency is missing', async () => {
      mockHttpService.get.mockReturnValue(
        of({ data: { data: [{ id: '1', name: 'WABA', timezone_id: '1' }] } }),
      );

      await expect(service.getWabaAccounts('biz', 'token')).rejects.toThrow(
        'meta_invalid_response: waba.currency',
      );
    });

    it('should throw BadGatewayException when waba.timezone_id is missing', async () => {
      mockHttpService.get.mockReturnValue(
        of({ data: { data: [{ id: '1', name: 'WABA', currency: 'USD' }] } }),
      );

      await expect(service.getWabaAccounts('biz', 'token')).rejects.toThrow(
        'meta_invalid_response: waba.timezone_id',
      );
    });

    it('should throw BadGatewayException on HTTP error', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({
          response: { data: { error: { code: 100, message: 'Invalid param' } } },
          message: 'Request failed',
        })),
      );

      await expect(service.getWabaAccounts('biz', 'token')).rejects.toThrow(
        'meta_api_error',
      );
    });
  });

  // ─── getPhoneNumbers ──────────────────────────────────────────────────────

  describe('getPhoneNumbers', () => {
    const validPhone = {
      id: '789',
      display_phone_number: '+1 555-0100',
      verified_name: 'My Business',
    };

    it('should GET /{wabaId}/phone_numbers and return phones', async () => {
      mockHttpService.get.mockReturnValue(
        of({ data: { data: [validPhone] } }),
      );

      const result = await service.getPhoneNumbers('waba-456', 'access-token');

      expect(result).toEqual([validPhone]);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/waba-456/phone_numbers',
        expect.objectContaining({ params: { access_token: 'access-token' } }),
      );
    });

    it('should throw BadGatewayException when phone.id is missing', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            data: [{ display_phone_number: '+1 555', verified_name: 'Biz' }],
          },
        }),
      );

      await expect(service.getPhoneNumbers('waba', 'token')).rejects.toThrow(
        'meta_invalid_response: phone.id',
      );
    });

    it('should throw BadGatewayException when display_phone_number is missing', async () => {
      mockHttpService.get.mockReturnValue(
        of({ data: { data: [{ id: '1', verified_name: 'Biz' }] } }),
      );

      await expect(service.getPhoneNumbers('waba', 'token')).rejects.toThrow(
        'meta_invalid_response: phone.display_phone_number',
      );
    });

    it('should throw BadGatewayException when verified_name is missing', async () => {
      mockHttpService.get.mockReturnValue(
        of({ data: { data: [{ id: '1', display_phone_number: '+1 555' }] } }),
      );

      await expect(service.getPhoneNumbers('waba', 'token')).rejects.toThrow(
        'meta_invalid_response: phone.verified_name',
      );
    });

    it('should throw BadGatewayException on HTTP error', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({
          response: { data: { error: { code: 100, message: 'Not found' } } },
          message: 'Request failed',
        })),
      );

      await expect(service.getPhoneNumbers('waba', 'token')).rejects.toThrow(
        'meta_api_error',
      );
    });
  });
});
