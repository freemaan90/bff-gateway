// Feature: whatsapp-official-api-integration
// Property 13: Numeric-only validation for phoneNumberId and wabaId
// Property 14: accessToken minimum length validation
// Validates: Requirements 9.3, 9.4
import * as fc from 'fast-check';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateOfficialSessionDto } from './create-official-session.dto';

function buildDto(overrides: Partial<CreateOfficialSessionDto>): CreateOfficialSessionDto {
  return plainToInstance(CreateOfficialSessionDto, {
    phoneNumberId: '123456789',
    accessToken: 'EAAxxxxxxxxxxxxxxxxxxxxxxxx',
    wabaId: '987654321',
    phoneNumber: '5491112345678',
    ...overrides,
  });
}

async function isValid(dto: CreateOfficialSessionDto): Promise<boolean> {
  const errors = await validate(dto);
  return errors.length === 0;
}

async function hasErrorOn(
  dto: CreateOfficialSessionDto,
  field: string,
): Promise<boolean> {
  const errors = await validate(dto);
  return errors.some((e) => e.property === field);
}

describe('CreateOfficialSessionDto', () => {
  describe('valid payload', () => {
    it('passes validation with all correct fields', async () => {
      const dto = buildDto({});
      expect(await isValid(dto)).toBe(true);
    });
  });

  // Property 13: Numeric-only validation for phoneNumberId and wabaId
  describe('Property 13 — phoneNumberId must be numeric only', () => {
    it('rejects non-numeric phoneNumberId', async () => {
      fc.assert(
        await fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /[^0-9]/.test(s)),
          async (phoneNumberId) => {
            const dto = buildDto({ phoneNumberId });
            return await hasErrorOn(dto, 'phoneNumberId');
          },
        ),
      );
    });

    it('accepts numeric-only phoneNumberId', async () => {
      fc.assert(
        await fc.asyncProperty(
          fc.stringMatching(/^\d{5,15}$/),
          async (phoneNumberId) => {
            const dto = buildDto({ phoneNumberId });
            return !(await hasErrorOn(dto, 'phoneNumberId'));
          },
        ),
      );
    });

    it('rejects non-numeric wabaId', async () => {
      fc.assert(
        await fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /[^0-9]/.test(s)),
          async (wabaId) => {
            const dto = buildDto({ wabaId });
            return await hasErrorOn(dto, 'wabaId');
          },
        ),
      );
    });

    it('accepts numeric-only wabaId', async () => {
      fc.assert(
        await fc.asyncProperty(
          fc.stringMatching(/^\d{5,15}$/),
          async (wabaId) => {
            const dto = buildDto({ wabaId });
            return !(await hasErrorOn(dto, 'wabaId'));
          },
        ),
      );
    });
  });

  // Property 14: accessToken minimum length validation
  describe('Property 14 — accessToken minimum length', () => {
    it('rejects accessToken shorter than 20 chars', async () => {
      fc.assert(
        await fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 19 }),
          async (accessToken) => {
            const dto = buildDto({ accessToken });
            return await hasErrorOn(dto, 'accessToken');
          },
        ),
      );
    });

    it('accepts accessToken of 20+ chars', async () => {
      fc.assert(
        await fc.asyncProperty(
          fc.string({ minLength: 20, maxLength: 200 }),
          async (accessToken) => {
            const dto = buildDto({ accessToken });
            return !(await hasErrorOn(dto, 'accessToken'));
          },
        ),
      );
    });
  });

  describe('required fields', () => {
    it('rejects empty phoneNumberId', async () => {
      const dto = buildDto({ phoneNumberId: '' });
      expect(await hasErrorOn(dto, 'phoneNumberId')).toBe(true);
    });

    it('rejects empty wabaId', async () => {
      const dto = buildDto({ wabaId: '' });
      expect(await hasErrorOn(dto, 'wabaId')).toBe(true);
    });

    it('rejects empty accessToken', async () => {
      const dto = buildDto({ accessToken: '' });
      expect(await hasErrorOn(dto, 'accessToken')).toBe(true);
    });
  });
});
