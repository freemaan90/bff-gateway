import { IsString, Matches } from 'class-validator';

export class SelectPhoneDto {
  @IsString()
  @Matches(/^\d+$/, { message: 'phoneNumberId must contain only digits' })
  phoneNumberId: string;
}
