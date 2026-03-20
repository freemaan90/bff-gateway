/**
 * Feature: whatsapp-onboarding, Property 8: Errores de Meta retornan HTTP 502
 *
 * Validates: Requirements 3.4, 4.8
 */
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { BadGatewayException } from '@nestjs/common';
import { throwError } from 'rxjs';
import * as fc from 'fast-check';
import { MetaGraphApiService } from './meta-graph-api.service';

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

describe('MetaGraphApiService — Property 8: Meta errors → HTTP 502', () => {
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

  /**
   * Propiedad 8: Para cualquier respuesta de error de Meta Graph API
   * (en token exchange o consulta de recursos), el servicio debe lanzar
   * BadGatewayException (HTTP 502) con un mensaje descriptivo.
   *
   * Validates: Requirements 3.4, 4.8
   */
  it('Property 8: any HTTP error from Meta on token exchange throws BadGatewayException', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          code: fc.integer({ min: 100, max: 999 }),
          message: fc.string({ minLength: 1, maxLength: 100 }),
          errorSubcode: fc.option(fc.integer({ min: 1, max: 9999 })),
        }),
        async ({ code, message, errorSubcode }) => {
          jest.clearAllMocks();
          mockHttpService.post.mockReturnValue(
            throwError(() => ({
              response: {
                data: {
                  error: { code, message, error_subcode: errorSubcode ?? undefined },
                },
              },
              message: 'Request failed with status code 400',
            })),
          );

          await expect(
            service.exchangeCodeForShortLivedToken('code', 'verifier', 'uri'),
          ).rejects.toThrow(BadGatewayException);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 8: any HTTP error from Meta on long-lived token exchange throws BadGatewayException', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          code: fc.integer({ min: 100, max: 999 }),
          message: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async ({ code, message }) => {
          jest.clearAllMocks();
          mockHttpService.get.mockReturnValue(
            throwError(() => ({
              response: { data: { error: { code, message } } },
              message: 'Request failed',
            })),
          );

          await expect(
            service.exchangeForLongLivedToken('short-token'),
          ).rejects.toThrow(BadGatewayException);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 8: any HTTP error from Meta on getBusinesses throws BadGatewayException', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          code: fc.integer({ min: 100, max: 999 }),
          message: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async ({ code, message }) => {
          jest.clearAllMocks();
          mockHttpService.get.mockReturnValue(
            throwError(() => ({
              response: { data: { error: { code, message } } },
              message: 'Request failed',
            })),
          );

          await expect(service.getBusinesses('token')).rejects.toThrow(
            BadGatewayException,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 8: any HTTP error from Meta on getWabaAccounts throws BadGatewayException', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          code: fc.integer({ min: 100, max: 999 }),
          message: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async ({ code, message }) => {
          jest.clearAllMocks();
          mockHttpService.get.mockReturnValue(
            throwError(() => ({
              response: { data: { error: { code, message } } },
              message: 'Request failed',
            })),
          );

          await expect(
            service.getWabaAccounts('biz-id', 'token'),
          ).rejects.toThrow(BadGatewayException);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 8: any HTTP error from Meta on getPhoneNumbers throws BadGatewayException', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          code: fc.integer({ min: 100, max: 999 }),
          message: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async ({ code, message }) => {
          jest.clearAllMocks();
          mockHttpService.get.mockReturnValue(
            throwError(() => ({
              response: { data: { error: { code, message } } },
              message: 'Request failed',
            })),
          );

          await expect(
            service.getPhoneNumbers('waba-id', 'token'),
          ).rejects.toThrow(BadGatewayException);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 8: malformed Meta response (missing required fields) throws BadGatewayException', async () => {
    // Arbitrary incomplete payloads for getBusinesses
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.option(fc.string({ minLength: 1 })),
            name: fc.option(fc.string({ minLength: 1 })),
          }),
          { minLength: 1, maxLength: 5 },
        ).filter((items) =>
          // At least one item is missing id or name
          items.some((item) => item.id === null || item.name === null),
        ),
        async (items) => {
          jest.clearAllMocks();
          // Build objects with null fields removed (simulating missing fields)
          const data = items.map((item) => {
            const obj: Record<string, string> = {};
            if (item.id !== null) obj.id = item.id as string;
            if (item.name !== null) obj.name = item.name as string;
            return obj;
          });

          mockHttpService.get.mockReturnValue(of({ data: { data } }));

          await expect(service.getBusinesses('token')).rejects.toThrow(
            BadGatewayException,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Need to import `of` for the last test
import { of } from 'rxjs';
